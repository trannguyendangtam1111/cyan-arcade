package com.cyan.arcade.common.security;

import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;

import org.apache.catalina.connector.Connector;
import org.apache.catalina.connector.Request;
import org.apache.catalina.connector.Response;
import org.apache.catalina.valves.RemoteIpValve;
import org.apache.catalina.valves.ValveBase;
import org.junit.jupiter.api.Test;

import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;

/** Exercise Tomcat's actual native forwarding implementation without starting a server. */
class TrustedProxyTests {

	@Test
	void forwardingDefaultsToNoneAndTheProxyPatternTrustsNoAddress() throws Exception {
		MockEnvironment environment = environment();
		assertThat(environment.getProperty("server.forward-headers-strategy")).isEqualTo("none");
		String pattern = environment.getProperty("server.tomcat.remoteip.internal-proxies");
		assertThat(Pattern.matches(pattern, "172.18.0.7")).isFalse();
		assertThat(Pattern.matches(pattern, "127.0.0.1")).isFalse();
	}

	@Test
	void enablingNativeWithoutAnExplicitProxyStillIgnoresForwardedAddresses() throws Exception {
		MockEnvironment environment = environment().withProperty("SERVER_FORWARD_HEADERS_STRATEGY", "native");
		assertThat(environment.getProperty("server.forward-headers-strategy")).isEqualTo("native");
		assertThat(addressSeenByApplication(environment, "172.18.0.7", "198.51.100.20")).isEqualTo("172.18.0.7");
	}

	@Test
	void onlyTheExplicitlyTrustedProxyCanSupplyAClientAddress() throws Exception {
		MockEnvironment environment = environment().withProperty("SERVER_FORWARD_HEADERS_STRATEGY", "native")
			.withProperty("TRUSTED_PROXY_REGEX", "^172\\.18\\.0\\.7$");
		assertThat(addressSeenByApplication(environment, "172.18.0.7", "198.51.100.20")).isEqualTo("198.51.100.20");
		assertThat(addressSeenByApplication(environment, "172.18.0.8", "198.51.100.20")).isEqualTo("172.18.0.8");
		assertThat(addressSeenByApplication(environment, "203.0.113.7", "198.51.100.20")).isEqualTo("203.0.113.7");
	}

	@Test
	void anUntrustedAddressAtTheEndOfAChainCannotBeSkipped() throws Exception {
		MockEnvironment environment = environment().withProperty("TRUSTED_PROXY_REGEX", "^172\\.18\\.0\\.7$");
		assertThat(addressSeenByApplication(environment, "172.18.0.7", "1.2.3.4, 198.51.100.20"))
			.isEqualTo("198.51.100.20");
	}

	private MockEnvironment environment() throws Exception {
		MockEnvironment environment = new MockEnvironment();
		environment.getPropertySources().addLast(new YamlPropertySourceLoader()
			.load("application", new ClassPathResource("application.yml")).getFirst());
		return environment;
	}

	private String addressSeenByApplication(MockEnvironment environment, String peer, String forwarded) throws Exception {
		RemoteIpValve valve = new RemoteIpValve();
		valve.setInternalProxies(environment.getProperty("server.tomcat.remoteip.internal-proxies"));
		valve.setPortHeader(environment.getProperty("server.tomcat.remoteip.port-header"));
		AtomicReference<String> seen = new AtomicReference<>();
		valve.setNext(new ValveBase() {
			@Override
			public void invoke(Request request, Response response) {
				seen.set(request.getRemoteAddr());
				// Forwarding must preserve the public port used in same-origin/CSRF checks.
				boolean trusted = Pattern.matches(environment.getProperty("server.tomcat.remoteip.internal-proxies"), peer);
				assertThat(request.getServerPort()).isEqualTo(trusted ? 3000 : 8080);
			}
		});
		org.apache.coyote.Request coyote = new org.apache.coyote.Request();
		coyote.scheme().setString("http");
		coyote.serverName().setString("localhost");
		coyote.setServerPort(8080);
		coyote.getMimeHeaders().addValue("X-Forwarded-For").setString(forwarded);
		coyote.getMimeHeaders().addValue("X-Forwarded-Proto").setString("http");
		coyote.getMimeHeaders().addValue("X-Forwarded-Port").setString("3000");
		coyote.getMimeHeaders().addValue("Forwarded").setString("for=1.2.3.4");
		Request request = new Request(new Connector(), coyote);
		request.setRemoteAddr(peer);
		request.setRemoteHost(peer);
		valve.invoke(request, new Response(new org.apache.coyote.Response()));
		return seen.get();
	}

}
