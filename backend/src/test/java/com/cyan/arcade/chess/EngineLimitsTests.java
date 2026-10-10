package com.cyan.arcade.chess;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import com.cyan.arcade.chess.stockfish.EngineScore;
import com.cyan.arcade.chess.stockfish.SearchRequest;
import com.cyan.arcade.chess.stockfish.SearchResult;
import com.cyan.arcade.common.error.ApiException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The analysis cache's keys and limits, and the per-account rate limit. */
class EngineLimitsTests {

	private static final SearchRequest REQUEST = new SearchRequest(null, List.of("e2e4"),
			new SearchRequest.Limits(12, 500, null), 1, SearchRequest.Strength.FULL);

	private static final SearchResult RESULT = new SearchResult("e7e5", null,
			List.of(new SearchResult.Line(1, 12, 14, EngineScore.centipawns(-20), List.of("e7e5"), 100)), 12, false, 50);

	private MutableClock clock = new MutableClock();

	private ChessAiProperties properties(int cacheEntries, int perMinute, int threads) {
		return new ChessAiProperties(
				new ChessAiProperties.Engine("x", 2, 4, Duration.ofSeconds(3), threads, 32, Duration.ofSeconds(30), Duration.ofSeconds(2)),
				new ChessAiProperties.Hints(Duration.ofMillis(600), 18),
				new ChessAiProperties.Evaluation(16, 22, Duration.ofSeconds(3), 3),
				new ChessAiProperties.Review(Duration.ofMillis(250), 16, 8, 300, 1, 4, Duration.ofMinutes(30), Duration.ofMinutes(1)),
				new ChessAiProperties.Cache(cacheEntries, Duration.ofHours(6)), 3, perMinute);
	}

	@Test
	void aCachedResultIsServedOnlyForTheSameEngineSettingsAndPosition() {
		EngineAnalysisCache cache = new EngineAnalysisCache(properties(100, 30, 1), this.clock);
		cache.put(cache.key("Stockfish 19", REQUEST), RESULT);

		assertThat(cache.get(cache.key("Stockfish 19", REQUEST))).isEqualTo(RESULT);
		// Another engine version, other search settings, another position: other keys.
		assertThat(cache.get(cache.key("Stockfish 20", REQUEST))).isNull();
		assertThat(cache.get(cache.key("Stockfish 19", new SearchRequest(null, List.of("e2e4"),
				new SearchRequest.Limits(14, 500, null), 1, SearchRequest.Strength.FULL)))).isNull();
		assertThat(cache.get(cache.key("Stockfish 19", new SearchRequest(null, List.of("e2e4"),
				new SearchRequest.Limits(12, 500, null), 2, SearchRequest.Strength.FULL)))).isNull();
		assertThat(cache.get(cache.key("Stockfish 19", new SearchRequest(null, List.of("e2e4"),
				new SearchRequest.Limits(12, 500, null), 1, new SearchRequest.Strength(5, null))))).isNull();
		assertThat(cache.get(cache.key("Stockfish 19", new SearchRequest(null, List.of("d2d4"),
				new SearchRequest.Limits(12, 500, null), 1, SearchRequest.Strength.FULL)))).isNull();
		// And other engine settings (threads, hash) too.
		EngineAnalysisCache otherThreads = new EngineAnalysisCache(properties(100, 30, 2), this.clock);
		assertThat(otherThreads.key("Stockfish 19", REQUEST)).isNotEqualTo(cache.key("Stockfish 19", REQUEST));
		// Before an engine has said its name, nothing is cached.
		assertThat(cache.key(null, REQUEST)).isNull();
	}

	@Test
	void theCacheKeepsOnlyCompleteResultsForALimitedTimeAndNumber() {
		EngineAnalysisCache cache = new EngineAnalysisCache(properties(2, 30, 1), this.clock);
		SearchResult provisional = new SearchResult("e7e5", null, RESULT.lines(), 5, true, 50);
		cache.put("cut short", provisional);
		assertThat(cache.get("cut short")).isNull();

		cache.put("a", RESULT);
		cache.put("b", RESULT);
		cache.get("a");
		cache.put("c", RESULT);
		// The least recently used went.
		assertThat(cache.get("b")).isNull();
		assertThat(cache.get("a")).isNotNull();
		assertThat(cache.size()).isEqualTo(2);

		this.clock.advance(Duration.ofHours(7));
		assertThat(cache.get("a")).isNull();
	}

	@Test
	void anAccountMayAskTheEngineOnlySoOftenAMinute() {
		EngineRateLimiter limiter = new EngineRateLimiter(properties(10, 3, 1), this.clock);
		limiter.check(1L);
		limiter.check(1L);
		limiter.check(1L);
		assertThatThrownBy(() -> limiter.check(1L)).isInstanceOfSatisfying(ApiException.class,
				(ex) -> assertThat(ex.getCode()).isEqualTo(EngineRateLimiter.TOO_MANY_ENGINE_REQUESTS));
		// Another account is not affected, and a minute later the first may ask again.
		limiter.check(2L);
		this.clock.advance(Duration.ofSeconds(61));
		limiter.check(1L);
	}

	private static final class MutableClock extends Clock {

		private Instant now = Instant.parse("2026-10-10T08:00:00Z");

		void advance(Duration duration) {
			this.now = this.now.plus(duration);
		}

		@Override
		public ZoneOffset getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(java.time.ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return this.now;
		}

	}

}
