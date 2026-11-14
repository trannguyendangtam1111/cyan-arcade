package com.cyan.arcade.tcg.administration;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.game.PilotCatalogLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/** Administrative visibility for the one validated pilot. This is not a licensing approval. */
@Service
@Transactional
@PreAuthorize("hasRole('ADMIN')")
public class YugiohPilotService {

	private static final Logger log = LoggerFactory.getLogger(YugiohPilotService.class);
	private final YugiohPilotStore store;
	private final PilotCatalogLock lock;
	private final boolean activationAllowed;
	private final String setCode;
	private final String expectedAttribution;
	private final TcgDataset.Pack expectedPack;
	private final Map<String, Integer> expectedTiers = new HashMap<>();

	YugiohPilotService(YugiohPilotStore store, PilotCatalogLock lock, JsonMapper json,
			@Value("classpath:tcg/pilots/yugioh.json") Resource configuration,
			@Value("${app.tcg.pilots.yugioh.activation-allowed:false}") boolean activationAllowed) {
		this.store = store;
		this.lock = lock;
		this.activationAllowed = activationAllowed;
		try (var input = configuration.getInputStream()) {
			var config = json.readTree(input);
			this.setCode = config.path("sets").get(0).path("code").asString();
			this.expectedAttribution = config.path("game").path("attribution").asString();
			this.expectedPack = json.treeToValue(config.path("sets").get(0).path("pack"), TcgDataset.Pack.class);
			config.path("rarities").forEach(r -> this.expectedTiers.put(r.path("code").asString(), r.path("tier").asInt()));
		}
		catch (IOException ex) {
			throw new IllegalStateException("Cannot read the shipped Yu-Gi-Oh! release policy", ex);
		}
	}

	public record Counts(int sets, int printings, int distinctCards, int packs, int poolCards, int oddsRows) { }
	public record Readiness(boolean activationAllowed, boolean dataValid, boolean gameActive, boolean packActive,
			Counts counts, List<String> problems) { }

	public Readiness readiness() {
		this.lock.lockYugioh();
		return inspect();
	}

	public Readiness setVisible(boolean active, long adminId) {
		this.lock.lockYugioh();
		if (active && !this.activationAllowed) {
			throw new ConflictException("PILOT_ACTIVATION_DISABLED", "Yu-Gi-Oh! activation is disabled in this environment");
		}
		var game = this.store.game().orElseThrow(() -> new NotFoundException("Card game", "yugioh"));
		if (active) {
			Readiness readiness = inspect();
			if (!readiness.dataValid()) {
				throw new ConflictException("PILOT_NOT_READY", String.join("; ", readiness.problems()));
			}
		}
		// Deactivation deliberately bypasses readiness and the activation gate, including corrupt catalogs.
		this.store.setVisible(game.id(), active);
		log.info("Admin {} set Yu-Gi-Oh! game and pack visibility to {}", adminId, active);
		return inspect();
	}

	private Readiness inspect() {
		var found = this.store.game();
		if (found.isEmpty()) {
			return new Readiness(this.activationAllowed, false, false, false, new Counts(0, 0, 0, 0, 0, 0),
					List.of("Import the hidden Yu-Gi-Oh! pilot first"));
		}
		var game = found.get();
		var sets = this.store.sets(game.id());
		var packs = this.store.packs(game.id());
		var rarities = this.store.rarities(game.id());
		var cards = this.store.cards(game.id());
		List<String> problems = new ArrayList<>();
		var set = sets.stream().filter(s -> s.code().equals(this.setCode)).findFirst();
		if (sets.size() != 1 || set.isEmpty()) problems.add("Exactly the Beyond the Brave set is required");
		var pack = packs.stream().filter(p -> p.code().equals(this.expectedPack.code())
				&& set.isPresent() && p.setId() == set.get().id()).findFirst();
		if (packs.size() != 1 || pack.isEmpty()) problems.add("Exactly the configured pilot pack in Beyond the Brave is required");
		Map<Long, String> rarityCodes = rarities.stream().collect(Collectors.toMap(YugiohPilotStore.Rarity::id,
				YugiohPilotStore.Rarity::code));
		Map<String, Integer> tiers = rarities.stream().collect(Collectors.toMap(YugiohPilotStore.Rarity::code,
				YugiohPilotStore.Rarity::tier));
		if (!tiers.equals(this.expectedTiers)) problems.add("Rarities and tiers must match the shipped pilot configuration");
		int distinct = (int) cards.stream().map(YugiohPilotStore.Card::passcode).filter(p -> p != null && p.matches("[0-9]+"))
			.distinct().count();
		if (cards.size() != 127 || distinct != 100) problems.add("The pilot requires 127 printings representing 100 cards");
		boolean invalidCard = cards.stream().anyMatch(c -> set.isEmpty() || c.setId() != set.get().id()
				|| !rarityCodes.containsKey(c.rarityId()) || c.number() == null || !c.number().matches("BETB-EN[0-9]{3}")
				|| !((this.setCode + ":" + c.number() + ":" + rarityCodes.get(c.rarityId())).equals(c.externalId()))
				|| blank(c.passcode()) || !c.passcode().matches("[0-9]+") || blank(c.name()) || blank(c.type()) || blank(c.effect()));
		if (invalidCard) problems.add("Every printing needs its correct set, rarity, stable printing ID and card text");
		boolean hasArtwork = game.image() != null || game.back() != null || sets.stream().anyMatch(s -> s.image() != null || s.cover() != null)
				|| packs.stream().anyMatch(p -> p.image() != null) || cards.stream().anyMatch(c -> c.image() != null || c.thumbnail() != null);
		if (hasArtwork) problems.add("This pilot must remain text-only with no artwork URLs");
		if (!this.expectedAttribution.equals(game.attribution())) problems.add("The configured provider and rights-holder attribution is required");
		List<Long> pool = pack.map(p -> this.store.pool(p.id())).orElse(List.of());
		var odds = pack.map(p -> this.store.odds(p.id())).orElse(List.of());
		if (!new HashSet<>(pool).equals(cards.stream().map(YugiohPilotStore.Card::id).collect(Collectors.toSet())) || pool.isEmpty()) {
			problems.add("The pack pool must contain every pilot printing and no other cards");
		}
		if (pack.isPresent() && !this.expectedPack.oddsNote().equals(pack.get().note())) {
			problems.add("The configured Arcade Simulated Odds disclosure is required");
		}
		Set<Rule> expected = new HashSet<>();
		int number = 0;
		for (var group : this.expectedPack.slots()) {
			for (int i = 0; i < group.count(); i++) {
				number++;
				for (var entry : group.odds().entrySet()) expected.add(new Rule(number, entry.getKey(), entry.getValue()));
			}
		}
		Set<Rule> actual = odds.stream().map(o -> new Rule(o.slot(), rarityCodes.get(o.rarityId()), o.weight()))
			.collect(Collectors.toSet());
		if (number != 9 || !actual.equals(expected)) problems.add("All nine slots must match the configured rarity weights exactly");
		Set<Long> poolIds = new HashSet<>(pool);
		Set<String> poolRarities = cards.stream().filter(c -> poolIds.contains(c.id())).map(c -> rarityCodes.get(c.rarityId()))
			.collect(Collectors.toSet());
		if (!poolRarities.containsAll(expected.stream().map(Rule::rarity).collect(Collectors.toSet()))) {
			problems.add("Every configured slot rarity must have an eligible printing pool");
		}
		return new Readiness(this.activationAllowed, problems.isEmpty(), game.active(),
				pack.map(YugiohPilotStore.Pack::active).orElse(false),
				new Counts(sets.size(), cards.size(), distinct, packs.size(), pool.size(), odds.size()), List.copyOf(problems));
	}

	private record Rule(int slot, String rarity, int weight) { }

	private static boolean blank(String text) {
		return text == null || text.isBlank();
	}
}
