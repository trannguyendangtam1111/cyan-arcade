package com.cyan.arcade.auth;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Optional;
import java.util.stream.Stream;

import com.cyan.arcade.auth.AdminAccountSeeder.AdminProperties;
import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.security.Role;
import com.cyan.arcade.user.UserCredentials;
import com.cyan.arcade.user.UserService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

/** Seeder configuration and account preservation, without a database or application server. */
class AdminAccountSeederTests {

	private static final String USERNAME = "configured_admin";

	private static final String PASSWORD = "test-only-admin-secret";

	private final UserService users = mock(UserService.class);

	private final PasswordEncoder encoder = mock(PasswordEncoder.class);

	private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
		.withInitializer((context) -> {
			// Exercise application.yml defaults independently of the developer's environment.
			context.getEnvironment().getPropertySources()
				.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
			context.getEnvironment().getPropertySources().addLast(applicationProperties());
		})
		.withUserConfiguration(AdminAccountSeeder.class)
		.withBean(UserService.class, () -> this.users)
		.withBean(PasswordEncoder.class, () -> this.encoder);

	@Test
	void seedingIsDisabledByDefaultWithoutCredentials() {
		this.contextRunner.run((context) -> {
			assertThat(context).hasNotFailed();
			AdminProperties properties = context.getBean(AdminProperties.class);
			assertThat(properties.seed()).isFalse();
			assertThat(properties.username()).isEmpty();
			assertThat(properties.password()).isEmpty();
			context.getBean(AdminAccountSeeder.class).run(new DefaultApplicationArguments());
		});
		verifyNoInteractions(this.users, this.encoder);
	}

	@Test
	void credentialsAloneDoNotEnableSeeding() {
		this.contextRunner.withPropertyValues("ADMIN_USERNAME=" + USERNAME, "ADMIN_PASSWORD=" + PASSWORD)
			.run((context) -> {
				assertThat(context).hasNotFailed();
				AdminAccountSeeder seeder = context.getBean(AdminAccountSeeder.class);
				seeder.run(new DefaultApplicationArguments());
				assertThat(seeder.seed()).isFalse();
			});
		verifyNoInteractions(this.users, this.encoder);
	}

	@Test
	void explicitOptInCreatesAnAdminWithTheEncodedConfiguredPassword() {
		when(this.users.findCredentials(USERNAME)).thenReturn(Optional.empty());
		when(this.encoder.encode(PASSWORD)).thenReturn("{bcrypt}test-hash");
		enabledContext().run((context) -> {
			assertThat(context).hasNotFailed();
			context.getBean(AdminAccountSeeder.class).run(new DefaultApplicationArguments());
		});
		verify(this.users).findCredentials(USERNAME);
		verify(this.encoder).encode(PASSWORD);
		verify(this.users).create(USERNAME, "{bcrypt}test-hash", Role.ADMIN);
		verifyNoMoreInteractions(this.users, this.encoder);
	}

	@ParameterizedTest
	@MethodSource("incompleteCredentials")
	void enabledSeedingWithMissingOrBlankCredentialsFailsBeforeAccessingAccounts(String username, String password) {
		this.contextRunner.withPropertyValues("ADMIN_SEED_ENABLED=true",
				"ADMIN_USERNAME=" + username, "ADMIN_PASSWORD=" + password)
			.run((context) -> {
				assertThat(context).hasFailed();
				assertThat(context.getStartupFailure()).hasRootCauseInstanceOf(IllegalArgumentException.class)
					.hasRootCauseMessage(
							"ADMIN_USERNAME and ADMIN_PASSWORD must both be set when ADMIN_SEED_ENABLED=true");
			});
		verifyNoInteractions(this.users, this.encoder);
	}

	static Stream<Arguments> incompleteCredentials() {
		return Stream.of(Arguments.of("", ""), Arguments.of("", PASSWORD), Arguments.of(USERNAME, ""),
				Arguments.of("   ", PASSWORD), Arguments.of(USERNAME, "   "));
	}

	@Test
	void enabledSeedingWithoutCredentialVariablesFailsSafely() {
		this.contextRunner.withPropertyValues("ADMIN_SEED_ENABLED=true").run((context) -> {
			assertThat(context).hasFailed();
			assertThat(context.getStartupFailure()).hasRootCauseInstanceOf(IllegalArgumentException.class);
		});
		verifyNoInteractions(this.users, this.encoder);
	}

	@ParameterizedTest
	@MethodSource("existingRoles")
	void existingAccountsAreNeverRecreatedPromotedOrGivenANewPassword(Role role) {
		UserCredentials existing = new UserCredentials(1L, USERNAME, "unchanged-existing-hash", role);
		when(this.users.findCredentials(USERNAME)).thenReturn(Optional.of(existing));
		enabledContext().run((context) -> {
			assertThat(context).hasNotFailed();
			assertThat(context.getBean(AdminAccountSeeder.class).seed()).isFalse();
			assertThat(context.getBean(AdminAccountSeeder.class).seed()).isFalse();
		});
		verify(this.users, org.mockito.Mockito.times(2)).findCredentials(USERNAME);
		verifyNoMoreInteractions(this.users);
		verifyNoInteractions(this.encoder);
	}

	static Stream<Role> existingRoles() {
		return Stream.of(Role.ADMIN, Role.USER);
	}

	@Test
	void concurrentAccountCreationDoesNotOverwriteTheOtherAccount() {
		when(this.users.findCredentials(USERNAME)).thenReturn(Optional.empty());
		when(this.encoder.encode(PASSWORD)).thenReturn("{bcrypt}test-hash");
		when(this.users.create(USERNAME, "{bcrypt}test-hash", Role.ADMIN))
			.thenThrow(new ConflictException(UserService.USERNAME_TAKEN, "Username taken"));
		enabledContext().run((context) -> {
			assertThat(context).hasNotFailed();
			assertThat(context.getBean(AdminAccountSeeder.class).seed()).isFalse();
		});
		verify(this.users).findCredentials(USERNAME);
		verify(this.users).create(USERNAME, "{bcrypt}test-hash", Role.ADMIN);
		verifyNoMoreInteractions(this.users);
	}

	@Test
	void configurationDescriptionDoesNotExposeThePassword() {
		assertThat(new AdminProperties(true, USERNAME, PASSWORD).toString()).doesNotContain(PASSWORD);
	}

	private ApplicationContextRunner enabledContext() {
		return this.contextRunner.withPropertyValues("ADMIN_SEED_ENABLED=true", "ADMIN_USERNAME=" + USERNAME,
				"ADMIN_PASSWORD=" + PASSWORD);
	}

	private static PropertySource<?> applicationProperties() {
		try {
			return new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml")).getFirst();
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}

}
