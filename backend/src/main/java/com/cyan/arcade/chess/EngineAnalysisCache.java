package com.cyan.arcade.chess;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import com.cyan.arcade.chess.stockfish.SearchRequest;
import com.cyan.arcade.chess.stockfish.SearchResult;

import org.springframework.stereotype.Component;

/**
 * Engine results kept for reuse, so a position searched once (a hint asked again, a review run
 * twice, an evaluation repeated) is not searched again. In memory, least recently used first out,
 * each entry for a limited time.
 *
 * <p>The key is everything that decides a result: the engine's name and version from its own
 * handshake, the engine settings (threads, hash), the search settings (limits, lines, strength) and
 * the position as the engine is given it. A new engine version or a changed setting gives new keys,
 * so an old result is never served for them. Only complete searches are kept: one cut short is
 * provisional and is searched again next time.
 */
@Component
class EngineAnalysisCache {

	private record Entry(SearchResult result, Instant storedAt) {
	}

	private final int maxEntries;

	private final Duration ttl;

	private final String engineSettings;

	private final Clock clock;

	private final LinkedHashMap<String, Entry> entries = new LinkedHashMap<>(256, 0.75f, true) {

		@Override
		protected boolean removeEldestEntry(Map.Entry<String, Entry> eldest) {
			return size() > EngineAnalysisCache.this.maxEntries;
		}

	};

	EngineAnalysisCache(ChessAiProperties properties, Clock clock) {
		this.maxEntries = properties.cache().maxEntries();
		this.ttl = properties.cache().ttl();
		this.engineSettings = "threads " + properties.engine().threads() + "|hash " + properties.engine().hashMb();
		this.clock = clock;
	}

	/** The key of a search on an engine; {@code null} when the engine's name is not known yet. */
	String key(String engineName, SearchRequest request) {
		if (engineName == null || this.maxEntries <= 0) {
			return null;
		}
		return engineName + "|" + this.engineSettings + "|" + request.settingsFingerprint() + "|"
				+ request.positionCommand();
	}

	synchronized SearchResult get(String key) {
		if (key == null) {
			return null;
		}
		Entry entry = this.entries.get(key);
		if (entry == null) {
			return null;
		}
		if (entry.storedAt().plus(this.ttl).isBefore(this.clock.instant())) {
			this.entries.remove(key);
			return null;
		}
		return entry.result();
	}

	synchronized void put(String key, SearchResult result) {
		if (key == null || result.interrupted() || this.maxEntries <= 0) {
			return;
		}
		this.entries.put(key, new Entry(result, this.clock.instant()));
	}

	synchronized int size() {
		return this.entries.size();
	}

	synchronized void clear() {
		this.entries.clear();
	}

}
