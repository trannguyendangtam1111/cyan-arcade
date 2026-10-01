package com.cyan.arcade;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;

/**
 * Full application context with MockMvc and a real PostgreSQL (Testcontainers) migrated by Flyway.
 * All tests using this annotation share one cached context and one database container.
 *
 * <p>Daily challenges are not generated here: they would add XP to runs depending on the day the
 * tests happen to run. Tests about challenges create the ones they need. The daily pack limit is
 * low enough for a test to reach it. No scheduled job runs by itself; tests call the ones they
 * are about.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@SpringBootTest(properties = { "app.scheduling.enabled=false", "app.daily-challenges.generation-enabled=false",
		"app.tcg.daily-pack-limit=5" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, MockMvcTestConfiguration.class })
public @interface IntegrationTest {

}
