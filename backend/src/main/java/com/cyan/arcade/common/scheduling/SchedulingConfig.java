package com.cyan.arcade.common.scheduling;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Turns on {@code @Scheduled} methods: plain in-process timers, one set per running instance.
 * Every job in the application is written so that running it twice, or on two instances at once,
 * does no harm, which is why no distributed scheduler or lock is needed.
 *
 * <p>{@code app.scheduling.enabled=false} switches all of them off, as the tests do.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "app.scheduling.enabled", matchIfMissing = true)
class SchedulingConfig {

}
