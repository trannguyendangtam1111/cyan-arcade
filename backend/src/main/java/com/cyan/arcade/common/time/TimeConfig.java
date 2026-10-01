package com.cyan.arcade.common.time;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class TimeConfig {

	/**
	 * The server's clock, in UTC. Anything that depends on "today" takes it from here, never from
	 * the client, and tests can put a fixed clock in its place.
	 */
	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}

}
