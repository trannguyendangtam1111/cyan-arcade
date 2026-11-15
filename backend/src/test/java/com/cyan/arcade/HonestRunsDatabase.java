package com.cyan.arcade;

import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringExtension;

/**
 * Points {@link HonestRuns} at the database of the application context the running test class uses.
 *
 * <p>A test class with properties of its own gets a context, and so a database container, of its own.
 * Spring caches contexts, so classes sharing the usual one can run after it in any order; setting the
 * database once, when a context starts, would leave the helpers backdating runs in the other database.
 */
public final class HonestRunsDatabase implements BeforeAllCallback, BeforeEachCallback {

	@Override
	public void beforeAll(ExtensionContext context) {
		useDatabaseOf(context);
	}

	@Override
	public void beforeEach(ExtensionContext context) {
		useDatabaseOf(context);
	}

	private static void useDatabaseOf(ExtensionContext context) {
		HonestRuns.useDatabase(SpringExtension.getApplicationContext(context).getBean(JdbcTemplate.class));
	}

}
