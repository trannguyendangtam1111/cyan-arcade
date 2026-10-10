package com.cyan.arcade;

import com.cyan.arcade.chess.FakeStockfish;
import com.cyan.arcade.chess.stockfish.StockfishEngineAdapter;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Makes every MockMvc request carry a valid CSRF token, as the real app does on every request that
 * changes something. Tests about CSRF itself override it with an invalid token.
 */
@TestConfiguration(proxyBeanMethods = false)
public class MockMvcTestConfiguration {

	@Bean
	MockMvcBuilderCustomizer validCsrfTokenByDefault() {
		return (builder) -> builder.defaultRequest(get("/").with(csrf()));
	}

	/** Lets the test helpers finish runs as if they had been played for a while. */
	@Bean
	InitializingBean honestRunsUseTheDatabase(JdbcTemplate jdbc) {
		return () -> HonestRuns.useDatabase(jdbc);
	}


	/** The chess engine the tests play against: a scripted UCI engine, never a real one (see FakeStockfish). */
	@Bean
	FakeStockfish fakeStockfish() {
		return new FakeStockfish();
	}

	@Bean
	@Primary
	StockfishEngineAdapter.Launcher fakeStockfishLauncher(FakeStockfish fake) {
		return fake.launcher();
	}

}
