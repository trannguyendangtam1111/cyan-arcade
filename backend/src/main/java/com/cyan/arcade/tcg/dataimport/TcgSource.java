package com.cyan.arcade.tcg.dataimport;

/**
 * Somewhere a real card game's catalog comes from: an API, a data dump. A source fetches what it
 * is configured to fetch and turns it into a {@link TcgDataset}; the import then works from that
 * alone, so a new card game needs a new source and nothing else.
 *
 * <p>Sources are only asked for data by the import job ({@code app.tcg.import.sources}). Opening
 * packs, browsing cards and collections never reach them: the arcade works from its own database.
 */
public interface TcgSource {

	/** What the import job is told to run, e.g. {@code pokemon}. */
	String id();

	/** Where the data comes from, for logs and error messages. */
	String description();

	/**
	 * @throws TcgSourceException when the source cannot be reached or answers with something unusable
	 */
	TcgDataset fetch();

}
