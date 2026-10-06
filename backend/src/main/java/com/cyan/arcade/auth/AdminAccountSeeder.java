package com.cyan.arcade.auth;

import java.util.Optional;

import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.security.Role;
import com.cyan.arcade.user.UserCredentials;
import com.cyan.arcade.user.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Makes sure the arcade has an administrator: at startup, if there is no account with the
 * configured admin username, one is created with the {@link Role#ADMIN} role and the configured
 * password, hashed like every other password.
 *
 * <p>Idempotent: an existing account is never changed, recreated or given a new password, so
 * restarting the application does nothing once the admin exists. An existing account of that name
 * that is a player is left alone too, with a warning: an application that promoted whoever had
 * registered the name first would hand out admin rights.
 *
 * <p>The defaults ({@code admin} / {@code 11112002}) are for development and demos only; set
 * {@code ADMIN_USERNAME} and {@code ADMIN_PASSWORD} for anything real, or switch the seed off with
 * {@code ADMIN_SEED_ENABLED=false}. The password is never logged.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AdminAccountSeeder.AdminProperties.class)
@Order(0)
class AdminAccountSeeder implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(AdminAccountSeeder.class);

	/**
	 * @param seed whether to create the admin account at startup when it is missing
	 * @param username the admin account's username
	 * @param password the admin account's password, used only to create the account
	 */
	@ConfigurationProperties("app.admin")
	record AdminProperties(@DefaultValue("true") boolean seed, @DefaultValue("admin") String username,
			@DefaultValue("11112002") String password) {

		@Override
		public String toString() {
			// Keep the password out of logs and error messages.
			return "AdminProperties[seed=%s, username=%s]".formatted(this.seed, this.username);
		}

	}

	private final UserService users;

	private final PasswordEncoder passwordEncoder;

	private final AdminProperties properties;

	AdminAccountSeeder(UserService users, PasswordEncoder passwordEncoder, AdminProperties properties) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.properties = properties;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (this.properties.seed()) {
			seed();
		}
	}

	/** @return whether an account was created */
	boolean seed() {
		Optional<UserCredentials> existing = this.users.findCredentials(this.properties.username());
		if (existing.isPresent()) {
			if (existing.get().role() != Role.ADMIN) {
				log.warn("The admin username '{}' belongs to a player account; no admin account was created",
						this.properties.username());
			}
			return false;
		}
		try {
			this.users.create(this.properties.username(), this.passwordEncoder.encode(this.properties.password()),
					Role.ADMIN);
			log.info("Created the admin account '{}'", this.properties.username());
			return true;
		}
		catch (ConflictException ex) {
			// Another instance created it at the same moment: there is still exactly one.
			return false;
		}
	}

}
