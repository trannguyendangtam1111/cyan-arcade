package com.cyan.arcade.auth;

import com.cyan.arcade.user.UserService;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration(proxyBeanMethods = false)
class AuthConfig {

	/**
	 * Hashes passwords with bcrypt. Hashes are stored with an algorithm prefix ("{bcrypt}..."), so
	 * the algorithm can be changed later without invalidating existing passwords.
	 */
	@Bean
	PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

	/** Looks a player up by username for Spring Security's password check. */
	@Bean
	UserDetailsService userDetailsService(UserService users) {
		return (username) -> users.findCredentials(username)
			.map(LoginUser::new)
			.orElseThrow(() -> new UsernameNotFoundException("No such user"));
	}

	/**
	 * Checks a username and password. Spring's provider compares against the stored hash and takes
	 * the same time whether or not the username exists, so response times do not reveal which
	 * usernames are registered.
	 */
	@Bean
	AuthenticationManager authenticationManager(UserDetailsService userDetailsService, PasswordEncoder passwordEncoder) {
		DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
		provider.setPasswordEncoder(passwordEncoder);
		return new ProviderManager(provider);
	}

}
