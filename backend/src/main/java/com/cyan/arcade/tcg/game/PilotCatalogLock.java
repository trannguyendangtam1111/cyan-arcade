package com.cyan.arcade.tcg.game;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Serializes Yu-Gi-Oh! imports and visibility checks in their existing transactions. */
@Component
public class PilotCatalogLock {

	private final JdbcClient jdbc;

	public PilotCatalogLock(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public void lockYugioh() {
		this.jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended('tcg-pilot:yugioh', 0))")
			.query((row, index) -> 0).single();
	}
}
