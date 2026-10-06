package com.cyan.arcade.tcg.dataimport;

/**
 * What an import wrote: the totals of the dataset, whether its rows were new or updated.
 *
 * @param newCards how many of the cards were not in the catalog before; 0 when the same dataset is
 * imported again
 */
public record ImportReport(String gameSlug, int rarities, int sets, int cards, int newCards, int packs) {
}
