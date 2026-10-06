package com.cyan.arcade.tcg.pack;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.tcg.pack.PackBlueprint.Odds;
import com.cyan.arcade.tcg.pack.PackBlueprint.Slot;
import com.cyan.arcade.tcg.pack.PackResponse.Chance;
import com.cyan.arcade.tcg.pack.PackResponse.SlotOdds;
import com.cyan.arcade.tcg.pack.TcgPackStore.OddsRow;
import com.cyan.arcade.tcg.pack.TcgPackStore.PackRow;
import com.cyan.arcade.tcg.set.TcgSetService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TcgPackService {

	private final TcgPackStore packs;

	private final TcgSetService sets;

	TcgPackService(TcgPackStore packs, TcgSetService sets) {
		this.packs = packs;
		this.sets = sets;
	}

	/** The packs of a set that can be opened. Throws when there is no such set. */
	public List<PackResponse> packsOfSet(Long setId) {
		this.sets.get(setId);
		List<PackRow> rows = this.packs.findAvailableBySet(setId);
		Map<Long, List<OddsRow>> odds = this.packs.findOdds(rows.stream().map(PackRow::id).toList())
			.stream()
			.collect(Collectors.groupingBy(OddsRow::packId));
		return rows.stream().map((pack) -> toResponse(pack, odds.getOrDefault(pack.id(), List.of()))).toList();
	}

	/** One pack that can be opened. A pack that was withdrawn is not found here. */
	public PackResponse getAvailable(Long id) {
		PackRow pack = this.packs.findById(id).filter(PackRow::available).orElseThrow(() -> notFound(id));
		return toResponse(pack, this.packs.findOdds(List.of(id)));
	}

	/** What is needed to open a pack. Throws when no pack has that id. */
	public PackBlueprint blueprint(Long id) {
		PackRow pack = this.packs.findById(id).orElseThrow(() -> notFound(id));
		List<Slot> slots = bySlot(this.packs.findOdds(List.of(id))).entrySet()
			.stream()
			.map((slot) -> new Slot(slot.getKey(),
					slot.getValue().stream().map((odds) -> new Odds(odds.rarityId(), odds.weight())).toList()))
			.toList();
		return new PackBlueprint(id, pack.available(), slots, this.packs.findPool(id));
	}

	/** Looks several packs up at once, keyed by id, including ones that can no longer be opened. */
	public Map<Long, PackRef> refs(Collection<Long> ids) {
		return this.packs.findByIds(ids).stream().collect(Collectors.toMap(PackRow::id, PackRow::toRef));
	}

	private static PackResponse toResponse(PackRow pack, List<OddsRow> odds) {
		List<SlotOdds> slots = bySlot(odds).entrySet()
			.stream()
			.map((slot) -> new SlotOdds(slot.getKey(), chances(slot.getValue())))
			.toList();
		return new PackResponse(pack.id(), pack.code(), pack.name(), pack.description(), pack.imageUrl(),
				pack.setLogoUrl(), pack.coverImageUrl(), pack.accentColor(), pack.set(), pack.game(), slots.size(),
				pack.poolSize(), slots, pack.oddsNote());
	}

	/** Turns a slot's weights into percentages, to one decimal place. */
	private static List<Chance> chances(List<OddsRow> slot) {
		int total = slot.stream().mapToInt(OddsRow::weight).sum();
		return slot.stream()
			.map((odds) -> new Chance(odds.rarity(), Math.round(odds.weight() * 1000.0 / total) / 10.0))
			.toList();
	}

	private static Map<Integer, List<OddsRow>> bySlot(List<OddsRow> odds) {
		return odds.stream().collect(Collectors.groupingBy(OddsRow::slot, TreeMap::new, Collectors.toList()));
	}

	private static NotFoundException notFound(Long id) {
		return new NotFoundException("Card pack", id);
	}

}
