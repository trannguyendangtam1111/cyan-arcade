package com.cyan.arcade.tcg.dataimport;

/** What an import wrote: the totals of the dataset, whether its rows were new or updated. */
public record ImportReport(String gameSlug, int rarities, int sets, int cards, int packs) {
}
