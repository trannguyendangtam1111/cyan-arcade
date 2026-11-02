package com.cyan.arcade.common.deployment;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

class ProductionDeploymentTests {

	private MockEnvironment production() {
		return new MockEnvironment().withProperty("spring.datasource.url",
				"jdbc:postgresql://database.example.invalid/demo?sslmode=require")
			.withProperty("app.cors.allowed-origins", "https://arcade.example.invalid");
	}

	@Test
	void acceptsTlsWithoutOpeningAnyConnection() {
		assertThatCode(() -> ProductionDeploymentConfig.validate(production())).doesNotThrowAnyException();
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"jdbc:postgresql://database.example.invalid/demo",
			"jdbc:postgresql://database.example.invalid/demo?sslmode=disable",
			"jdbc:postgresql://database.example.invalid/demo?sslmode=prefer",
			"jdbc:postgresql://database.example.invalid/demo?sslmode=require&sslmode=disable",
			"jdbc:postgresql://database.example.invalid/demo?sslmode=require&password=test-only"
	})
	void rejectsMissingTlsDowngradesDuplicateModesAndEmbeddedCredentials(String url) {
		assertThatIllegalStateException().isThrownBy(() -> ProductionDeploymentConfig.validate(
				production().withProperty("spring.datasource.url", url)));
	}

	@ParameterizedTest
	@ValueSource(strings = { "", "*", "http://localhost:5173", "https://arcade.example.invalid/path" })
	void rejectsWildcardHttpAndNonOriginCorsSettings(String origin) {
		assertThatIllegalStateException().isThrownBy(() -> ProductionDeploymentConfig.validate(
				production().withProperty("app.cors.allowed-origins", origin)));
	}

	@Test
	void rejectsStartupImportsAndTheOneOffImportProfile() {
		MockEnvironment profile = production();
		profile.setActiveProfiles("prod", "import-tcg");
		assertThatIllegalStateException().isThrownBy(() -> ProductionDeploymentConfig.validate(profile));
		assertThatIllegalStateException().isThrownBy(() -> ProductionDeploymentConfig.validate(
				production().withProperty("app.tcg.import.sources", "pokemon")));
		assertThatIllegalStateException().isThrownBy(() -> ProductionDeploymentConfig.validate(
				production().withProperty("app.tcg.import.files", "test-only.json")));
	}

	@Test
	void productionYamlKeepsSecureCookiesValidationAndBoundedResources() throws Exception {
		MockEnvironment env = production();
		env.getPropertySources().addLast(new YamlPropertySourceLoader()
			.load("prod", new ClassPathResource("application-prod.yml")).getFirst());
		assertThat(env.getProperty("server.servlet.session.cookie.secure", Boolean.class)).isTrue();
		assertThat(env.getProperty("server.servlet.session.cookie.same-site")).isEqualTo("lax");
		assertThat(env.getProperty("server.forward-headers-strategy")).isEqualTo("none");
		assertThat(env.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
		assertThat(env.getProperty("spring.flyway.clean-disabled", Boolean.class)).isTrue();
		assertThat(env.getProperty("app.admin.seed", Boolean.class)).isFalse();
		assertThat(env.getProperty("app.tcg.import.sources")).isEmpty();
		assertThat(env.getProperty("spring.datasource.hikari.maximum-pool-size", Integer.class)).isEqualTo(3);
		assertThat(env.getProperty("app.chess.engine.pool-size", Integer.class)).isEqualTo(1);
		assertThat(env.getProperty("management.endpoint.health.group.readiness.include")).isEqualTo("readinessState,db");
	}

}
