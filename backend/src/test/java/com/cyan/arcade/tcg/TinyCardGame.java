package com.cyan.arcade.tcg;

import java.util.List;
import java.util.Map;

import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Game;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Pack;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Rarity;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Slot;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * A card game small enough to reason about in a test: seven cards, and packs whose contents are
 * known in advance.
 *
 * <pre>
 * set "base"    C1 C2 C3 (common)   R1 R2 (rare)   L1 (legendary)
 *   pack "booster"   3 cards: two commons, then a rare (90) or a legendary (10); pool: the whole set
 *   pack "single"    1 card, always C1
 *   pack "retired"   1 card, always C1; for the test that withdraws a pack
 *   pack "broken"    1 card, always C1; for the test that empties a pool
 * set "promo"   P1 (common)
 *   pack "promo"     1 card, always P1
 * </pre>
 */
public final class TinyCardGame {

	public static final String SLUG = "tiny-test-game";

	private TinyCardGame() {
	}

	public static TcgDataset dataset() {
		List<Slot> oneCommon = List.of(new Slot(1, Map.of("common", 100)));
		return new TcgDataset(new Game(SLUG, "Tiny Test Game", "For tests.", "/tiny/game.svg", null),
				List.of(new Rarity("common", "Common", 1), new Rarity("rare", "Rare", 3),
						new Rarity("legendary", "Legendary", 5)),
				List.of(new CardSet("base", "Base Set", "The first set.", "/tiny/base.svg", null,
						List.of(card("C1", "common"), card("C2", "common"), card("C3", "common"), card("R1", "rare"),
								card("R2", "rare"), card("L1", "legendary")),
						List.of(new Pack("booster", "Booster", "Three cards.", "/tiny/booster.svg",
								List.of(new Slot(2, Map.of("common", 100)),
										new Slot(1, Map.of("rare", 90, "legendary", 10))),
								null), pack("single", oneCommon, "C1"), pack("retired", oneCommon, "C1"),
								pack("broken", oneCommon, "C1"))),
						new CardSet("promo", "Promo", "", "/tiny/promo.svg", null, List.of(card("P1", "common")),
								List.of(new Pack("promo", "Promo Pack", "", "/tiny/promo-pack.svg", oneCommon, null)))));
	}

	public static Long setId(JdbcTemplate jdbc, String setCode) {
		return jdbc.queryForObject("""
				SELECT s.id FROM tcg_sets s JOIN tcg_games g ON g.id = s.game_id
				WHERE g.slug = ? AND s.code = ?
				""", Long.class, SLUG, setCode);
	}

	public static Long packId(JdbcTemplate jdbc, String packCode) {
		return jdbc.queryForObject("""
				SELECT p.id FROM tcg_packs p JOIN tcg_sets s ON s.id = p.set_id JOIN tcg_games g ON g.id = s.game_id
				WHERE g.slug = ? AND p.code = ?
				""", Long.class, SLUG, packCode);
	}

	public static Long cardId(JdbcTemplate jdbc, String number) {
		return jdbc.queryForObject("""
				SELECT c.id FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id
				WHERE g.slug = ? AND c.card_number = ?
				""", Long.class, SLUG, number);
	}

	private static Card card(String number, String rarity) {
		return new Card(number, "Card " + number, rarity, "/tiny/" + number + ".svg", Map.of("power", number.length()));
	}

	private static Pack pack(String code, List<Slot> slots, String... cards) {
		return new Pack(code, "Pack " + code, "", "/tiny/" + code + ".svg", slots, List.of(cards));
	}

}
