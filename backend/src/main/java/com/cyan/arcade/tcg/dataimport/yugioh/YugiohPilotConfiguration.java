package com.cyan.arcade.tcg.dataimport.yugioh;

import java.net.URI;
import java.time.Duration;

import com.cyan.arcade.tcg.dataimport.SourceHttp;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ResourceLoader;

/**
 * The Yu-Gi-Oh! pilot source, off unless {@code app.tcg.pilots.yugioh.enabled=true}. Off, there is
 * no {@code yugioh} source at all, so an import job asked for one refuses it as unknown.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "app.tcg.pilots.yugioh", name = "enabled", havingValue = "true")
@EnableConfigurationProperties(YugiohPilotConfiguration.PilotProperties.class)
class YugiohPilotConfiguration {

	/**
	 * @param enabled whether the pilot source exists; false unless set
	 * @param url YGOPRODeck's API
	 * @param config the pilot's configuration (a {@link YugiohConfig}), kept apart from the active games'
	 */
	@ConfigurationProperties("app.tcg.pilots.yugioh")
	record PilotProperties(boolean enabled, URI url, String config) {
	}

	@Bean
	YugiohSource yugiohSource(PilotProperties properties, JsonMapper json, ResourceLoader resources) {
		SourceHttp http = new SourceHttp(SourceHttp.clientFor(properties.url()).build(), json, Duration.ofSeconds(2));
		return new YugiohSource(new YgoprodeckClient(http, json),
				YugiohConfig.load(resources.getResource(properties.config()), json), properties.url().toString());
	}

}
