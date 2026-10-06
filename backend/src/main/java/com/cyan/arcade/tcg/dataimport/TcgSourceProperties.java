package com.cyan.arcade.tcg.dataimport;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where each card game source is read from (defaults in {@code application.yml}). A mirror, or a
 * source pinned to one version of its data, only needs a different URL.
 */
@ConfigurationProperties("app.tcg.sources")
public record TcgSourceProperties(Source pokemon, Source onePiece) {

	/**
	 * @param url where the source's data is
	 * @param config which sets to take and how to turn them into the arcade's format (a {@link SourceConfig})
	 */
	public record Source(URI url, String config) {
	}

}
