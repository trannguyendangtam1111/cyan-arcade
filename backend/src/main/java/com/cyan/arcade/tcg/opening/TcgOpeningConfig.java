package com.cyan.arcade.tcg.opening;

import java.security.SecureRandom;
import java.util.random.RandomGenerator;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(TcgOpeningConfig.OpeningProperties.class)
class TcgOpeningConfig {

	/**
	 * @param dailyPackLimit how many packs one player may open per day (UTC); 0 means no limit
	 */
	@ConfigurationProperties("app.tcg")
	record OpeningProperties(@DefaultValue("10") int dailyPackLimit) {

		OpeningProperties {
			if (dailyPackLimit < 0) {
				throw new IllegalArgumentException("app.tcg.daily-pack-limit must not be negative");
			}
		}

		boolean isLimited() {
			return this.dailyPackLimit > 0;
		}

	}

	/**
	 * Where pack openings get their randomness. A cryptographically strong source, so what a pack
	 * will contain cannot be predicted from the packs opened before it.
	 */
	@Bean
	RandomGenerator packRandom() {
		return new SecureRandom();
	}

}
