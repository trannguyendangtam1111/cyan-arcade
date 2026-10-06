package com.cyan.arcade.tcg.dataimport;

import java.io.InputStream;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Game;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Pack;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Rarity;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Slot;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Importing card game datasets: what is written, that it can be repeated, and what is refused. */
@IntegrationTest
class TcgDatasetImportTests {

	private static final List<Rarity> RARITIES = List.of(new Rarity("common", "Common", 1), new Rarity("rare", "Rare", 3));

	private static final List<Slot> ONE_COMMON = List.of(new Slot(1, Map.of("common", 1)));

	@Autowired
	private TcgDatasetImporter importer;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private JsonMapper json;

	@Test
	void importsAGameWithItsSetsCardsPacksPoolsAndOdds() {
		ImportReport report = this.importer.importDataset(game("import-basic", "Basic"), "test");

		assertThat(report).isEqualTo(new ImportReport("import-basic", 2, 1, 3, 3, 1));
		assertThat(count("tcg_sets s JOIN tcg_games g ON g.id = s.game_id WHERE g.slug = 'import-basic'")).isEqualTo(1);
		assertThat(this.jdbc.queryForList("""
				SELECT c.card_number || ':' || r.code || ':' || (c.metadata ->> 'power')
				FROM tcg_cards c JOIN tcg_rarities r ON r.id = c.rarity_id JOIN tcg_games g ON g.id = c.game_id
				WHERE g.slug = 'import-basic' ORDER BY c.card_number
				""", String.class)).containsExactly("1:common:10", "2:common:20", "3:rare:30");
		// "Two cards with these odds" becomes two numbered slots; the pool is what the pack lists.
		assertThat(this.jdbc.queryForList("""
				SELECT o.slot || ':' || r.code || ':' || o.weight
				FROM tcg_pack_slot_odds o JOIN tcg_rarities r ON r.id = o.rarity_id
				WHERE o.pack_id = ? ORDER BY o.slot, r.tier
				""", String.class, packId("import-basic"))).containsExactly("1:common:100", "2:common:100", "3:common:60",
				"3:rare:40");
		assertThat(poolOf("import-basic")).containsExactly("1", "2", "3");
	}

	@Test
	void importingTheSameDatasetAgainChangesNothing() {
		this.importer.importDataset(game("import-twice", "Twice"), "test");
		List<Map<String, Object>> cardsBefore = cardRows("import-twice");
		Long packBefore = packId("import-twice");

		ImportReport second = this.importer.importDataset(game("import-twice", "Twice"), "test");

		assertThat(second.cards()).isEqualTo(3);
		assertThat(second.newCards()).isZero();
		assertThat(cardRows("import-twice")).isEqualTo(cardsBefore);
		assertThat(packId("import-twice")).isEqualTo(packBefore);
		assertThat(count("tcg_games WHERE slug = 'import-twice'")).isEqualTo(1);
		assertThat(count("tcg_rarities r JOIN tcg_games g ON g.id = r.game_id WHERE g.slug = 'import-twice'"))
			.isEqualTo(2);
		assertThat(count("tcg_pack_slot_odds WHERE pack_id = " + packBefore)).isEqualTo(4);
	}

	@Test
	void aCorrectedDatasetUpdatesWhatIsThereAndKeepsItsIdentity() {
		this.importer.importDataset(game("import-fix", "Before"), "test");
		List<Object> idsBefore = cardRows("import-fix").stream().map((row) -> row.get("id")).toList();

		// A new name for the game and a card, card 2 promoted to rare, a fourth card, and a smaller pool.
		TcgDataset corrected = new TcgDataset(new Game("import-fix", "After", "", "/img.svg", "/back.svg"), RARITIES,
				List.of(new CardSet("base", "Base", "", "/set.svg", null,
						List.of(card("1", "Renamed", "common", 10), card("2", "Card 2", "rare", 20),
								card("3", "Card 3", "rare", 30), card("4", "Card 4", "common", 40)),
						List.of(new Pack("pack", "Pack", "", "/pack.svg", ONE_COMMON, List.of("1", "4"))))));
		this.importer.importDataset(corrected, "test");

		assertThat(this.jdbc.queryForObject("SELECT name || ':' || card_back_url FROM tcg_games WHERE slug = 'import-fix'",
				String.class))
			.isEqualTo("After:/back.svg");
		List<Map<String, Object>> cards = cardRows("import-fix");
		assertThat(cards).extracting((row) -> row.get("name") + ":" + row.get("rarity"))
			.containsExactly("Renamed:common", "Card 2:rare", "Card 3:rare", "Card 4:common");
		// The first three are the same rows as before, so collections that hold them are untouched.
		assertThat(cards.subList(0, 3)).extracting((row) -> row.get("id")).isEqualTo(idsBefore);
		assertThat(poolOf("import-fix")).containsExactly("1", "4");
		assertThat(count("tcg_pack_slot_odds WHERE pack_id = " + packId("import-fix"))).isEqualTo(1);
	}

	@Test
	void aCardDroppedFromADatasetStaysInTheCatalogButLeavesThePools() {
		this.importer.importDataset(game("import-drop", "Drop"), "test");

		TcgDataset withoutCardThree = new TcgDataset(new Game("import-drop", "Drop", "", "/img.svg", null), RARITIES,
				List.of(new CardSet("base", "Base", "", "/set.svg", null,
						List.of(card("1", "Card 1", "common", 10), card("2", "Card 2", "common", 20)),
						List.of(new Pack("pack", "Pack", "", "/pack.svg", ONE_COMMON, null)))));
		this.importer.importDataset(withoutCardThree, "test");

		// Someone may own card 3; it is never deleted. It just cannot be pulled any more.
		assertThat(cardRows("import-drop")).hasSize(3);
		assertThat(poolOf("import-drop")).containsExactly("1", "2");
	}

	@Test
	void anInconsistentDatasetIsRefusedWithEverythingThatIsWrongAndNothingIsWritten() {
		TcgDataset broken = new TcgDataset(new Game("import-broken", "Broken", "", "/img.svg", null), RARITIES,
				List.of(new CardSet("base", "Base", "", "/set.svg", null,
						List.of(card("1", "Card 1", "common", 1), card("1", "Again", "common", 1),
								card("2", "Card 2", "mythic", 1)),
						List.of(new Pack("pack", "Pack", "", "/pack.svg",
								List.of(new Slot(1, Map.of("common", 1, "rare", 1, "shiny", 1))), List.of("1", "9"))))));

		assertThatExceptionOfType(InvalidDatasetException.class)
			.isThrownBy(() -> this.importer.importDataset(broken, "broken.json"))
			.withMessageContaining("broken.json")
			.satisfies((ex) -> assertThat(ex.getProblems()).containsExactlyInAnyOrder(
					"set 'base' has more than one card '1'",
					"more than one card has the external id 'base-1'",
					"set 'base' card '2' has the unknown rarity 'mythic'",
					"set 'base' pack 'pack' lists card '9', which is not in the set",
					"set 'base' pack 'pack' has odds for 'rare' but no card of that rarity in its pool",
					"set 'base' pack 'pack' has odds for the unknown rarity 'shiny'"));

		assertThat(count("tcg_games WHERE slug = 'import-broken'")).isZero();
	}

	@Test
	void aDatasetWithMissingPartsIsRefusedBeforeAnythingElseIsChecked() {
		TcgDataset incomplete = new TcgDataset(new Game("Not A Slug", "", null, "/img.svg", null),
				List.of(new Rarity("common", "Common", 9)),
				List.of(new CardSet("base", "Base", "", "/set.svg", null, List.of(), null)));

		assertThatExceptionOfType(InvalidDatasetException.class)
			.isThrownBy(() -> this.importer.importDataset(incomplete, "test"))
			.satisfies((ex) -> assertThat(ex.getProblems()).hasSize(4)
				.anyMatch((problem) -> problem.startsWith("game.slug"))
				.anyMatch((problem) -> problem.startsWith("game.name"))
				.anyMatch((problem) -> problem.startsWith("rarities[0].tier"))
				.anyMatch((problem) -> problem.startsWith("sets[0].cards")));
	}

	@Test
	void alternateArtsThatShareAPrintedNumberAreSeparateCardsKnownByTheirExternalIds() {
		TcgDataset withVariants = new TcgDataset(new Game("import-variants", "Variants", "", null, null), RARITIES,
				List.of(new CardSet("op01", "569101", "Romance Dawn", "", "Booster Pack", null, "/cover.png", null,
						List.of(variant("OP01-120", "OP01-120", "rare"), variant("OP01-120_p1", "OP01-120", "rare"),
								variant("OP01-121", "OP01-121", "common")),
						List.of(new Pack("booster", "Booster", "", null, "Simulator probabilities.", ONE_COMMON,
								List.of("OP01-120_p1", "OP01-121"))))));

		ImportReport report = this.importer.importDataset(withVariants, "test");

		assertThat(report.cards()).isEqualTo(3);
		assertThat(report.newCards()).isEqualTo(3);
		assertThat(this.jdbc.queryForList("""
				SELECT c.external_id || '@' || c.card_number || ':' || c.display_order
				FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id
				WHERE g.slug = 'import-variants' ORDER BY c.display_order
				""", String.class)).containsExactly("OP01-120@OP01-120:0", "OP01-120_p1@OP01-120:1", "OP01-121@OP01-121:2");
		// A pack lists the cards it can give by their keys, so it can hold one art and not the other.
		assertThat(this.jdbc.queryForList("""
				SELECT c.external_id FROM tcg_pack_cards pc JOIN tcg_cards c ON c.id = pc.card_id
				WHERE pc.pack_id = ? ORDER BY c.external_id
				""", String.class, packId("import-variants"))).containsExactly("OP01-120_p1", "OP01-121");
		assertThat(this.jdbc.queryForObject("""
				SELECT s.external_id || '|' || s.series || '|' || s.cover_image_url || '|' || p.odds_note
				FROM tcg_sets s JOIN tcg_packs p ON p.set_id = s.id JOIN tcg_games g ON g.id = s.game_id
				WHERE g.slug = 'import-variants'
				""", String.class)).isEqualTo("569101|Booster Pack|/cover.png|Simulator probabilities.");

		assertThat(this.importer.importDataset(withVariants, "test").newCards()).isZero();
		assertThat(count("tcg_cards c JOIN tcg_games g ON g.id = c.game_id WHERE g.slug = 'import-variants'")).isEqualTo(3);
	}

	@Test
	void aCardTheSourceMovesToAnotherSetIsUpdatedRatherThanDuplicated() {
		CardSet first = new CardSet("first", null, "First", "", null, null, null, null,
				List.of(variant("card-a", "1", "common"), variant("card-b", "2", "common")), List.of());
		CardSet second = new CardSet("second", null, "Second", "", null, null, null, null,
				List.of(variant("card-c", "1", "common")), List.of());
		this.importer.importDataset(new TcgDataset(new Game("import-move", "Move", "", null, null), RARITIES,
				List.of(first, second)), "test");
		Long cardB = this.jdbc.queryForObject("SELECT id FROM tcg_cards WHERE external_id = 'card-b'", Long.class);

		CardSet firstWithoutB = new CardSet("first", null, "First", "", null, null, null, null,
				List.of(variant("card-a", "1", "common")), List.of());
		CardSet secondWithB = new CardSet("second", null, "Second", "", null, null, null, null,
				List.of(variant("card-c", "1", "common"), variant("card-b", "7", "rare")), List.of());
		ImportReport report = this.importer.importDataset(new TcgDataset(new Game("import-move", "Move", "", null, null),
				RARITIES, List.of(firstWithoutB, secondWithB)), "test");

		assertThat(report.newCards()).isZero();
		assertThat(this.jdbc.queryForMap("""
				SELECT c.id, s.code, c.card_number, r.code AS rarity
				FROM tcg_cards c JOIN tcg_sets s ON s.id = c.set_id JOIN tcg_rarities r ON r.id = c.rarity_id
				WHERE c.external_id = 'card-b'
				""")).containsEntry("id", cardB).containsEntry("code", "second").containsEntry("card_number", "7")
			.containsEntry("rarity", "rare");
		assertThat(count("tcg_cards c JOIN tcg_games g ON g.id = c.game_id WHERE g.slug = 'import-move'")).isEqualTo(3);
	}

	@Test
	void anExternalIdIdentifiesOneCardInTheWholeGame() {
		TcgDataset clash = new TcgDataset(new Game("import-clash", "Clash", "", null, null), RARITIES,
				List.of(new CardSet("one", null, "One", "", null, null, null, null, List.of(variant("same", "1", "common")),
						List.of()),
						new CardSet("two", null, "Two", "", null, null, null, null, List.of(variant("same", "1", "common")),
								List.of())));

		assertThatExceptionOfType(InvalidDatasetException.class)
			.isThrownBy(() -> this.importer.importDataset(clash, "test"))
			.satisfies((ex) -> assertThat(ex.getProblems()).containsExactly("more than one card has the external id 'same'"));
	}

	@Test
	void theDatabaseItselfKeepsCardGamesApart() {
		this.importer.importDataset(game("import-one", "One"), "test");
		this.importer.importDataset(game("import-two", "Two"), "test");
		Long setOfOne = this.jdbc.queryForObject(
				"SELECT s.id FROM tcg_sets s JOIN tcg_games g ON g.id = s.game_id WHERE g.slug = 'import-one'", Long.class);
		Map<String, Object> rarityOfTwo = this.jdbc.queryForMap("""
				SELECT r.id, r.game_id FROM tcg_rarities r JOIN tcg_games g ON g.id = r.game_id
				WHERE g.slug = 'import-two' AND r.code = 'common'
				""");

		// A card in a set of one game with a rarity of another is refused by the schema, whoever asks.
		assertThatThrownBy(() -> this.jdbc.update("""
				INSERT INTO tcg_cards (game_id, set_id, rarity_id, external_id, card_number, name, image_url)
				VALUES ((SELECT game_id FROM tcg_sets WHERE id = ?), ?, ?, 'stray', 'X', 'Stray', '/x.svg')
				""", setOfOne, setOfOne, rarityOfTwo.get("id"))).isInstanceOf(DataIntegrityViolationException.class);
	}

	/** One set of three cards and one pack of three cards: two commons, then common 60 / rare 40. */
	private static TcgDataset game(String slug, String name) {
		return new TcgDataset(new Game(slug, name, "A game for import tests.", "/img.svg", null), RARITIES,
				List.of(new CardSet("base", "Base", "", "/set.svg", null,
						List.of(card("1", "Card 1", "common", 10), card("2", "Card 2", "common", 20),
								card("3", "Card 3", "rare", 30)),
						List.of(new Pack("pack", "Pack", "", "/pack.svg",
								List.of(new Slot(2, Map.of("common", 100)), new Slot(1, Map.of("common", 60, "rare", 40))),
								null)))));
	}

	private static Card card(String number, String name, String rarity, int power) {
		return new Card(number, name, rarity, "/card-" + number + ".svg", Map.of("power", power));
	}

	private static Card variant(String externalId, String number, String rarity) {
		return new Card(externalId, number, "Card " + externalId, rarity, "/" + externalId + ".png",
				"/" + externalId + "-small.png", Map.of());
	}

	private List<Map<String, Object>> cardRows(String gameSlug) {
		return this.jdbc.queryForList("""
				SELECT c.id, c.card_number, c.name, r.code AS rarity
				FROM tcg_cards c JOIN tcg_rarities r ON r.id = c.rarity_id JOIN tcg_games g ON g.id = c.game_id
				WHERE g.slug = ? ORDER BY c.card_number
				""", gameSlug);
	}

	private Long packId(String gameSlug) {
		return this.jdbc.queryForObject("""
				SELECT p.id FROM tcg_packs p JOIN tcg_sets s ON s.id = p.set_id JOIN tcg_games g ON g.id = s.game_id
				WHERE g.slug = ?
				""", Long.class, gameSlug);
	}

	private List<String> poolOf(String gameSlug) {
		return this.jdbc.queryForList("""
				SELECT c.card_number FROM tcg_pack_cards pc JOIN tcg_cards c ON c.id = pc.card_id
				WHERE pc.pack_id = ? ORDER BY c.card_number
				""", String.class, packId(gameSlug));
	}

	private int count(String tableAndCondition) {
		return this.jdbc.queryForObject("SELECT count(*) FROM " + tableAndCondition, Integer.class);
	}

}
