package com.cyan.arcade.tcg.dataimport;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Reads JSON from a card game source, patiently: public sources answer the odd request with a
 * 502 or 503, and an import of a few dozen requests should not fail because of one of them.
 * Client errors (a wrong URL, a 404) are not retried.
 */
public final class SourceHttp {

	private static final Logger log = LoggerFactory.getLogger(SourceHttp.class);

	private static final int ATTEMPTS = 4;

	private final RestClient client;

	private final JsonMapper json;

	private final Duration backoff;

	public SourceHttp(RestClient client, JsonMapper json, Duration backoff) {
		this.client = client;
		this.json = json;
		this.backoff = backoff;
	}

	/** A client for the public internet: short connect timeout, generous read timeout, an honest user agent. */
	public static RestClient.Builder clientFor(URI baseUrl) {
		HttpClient http = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(10))
			.followRedirects(HttpClient.Redirect.NORMAL)
			.build();
		JdkClientHttpRequestFactory requests = new JdkClientHttpRequestFactory(http);
		requests.setReadTimeout(Duration.ofSeconds(60));
		return RestClient.builder()
			.baseUrl(baseUrl.toString())
			.requestFactory(requests)
			.defaultHeader(HttpHeaders.USER_AGENT, "CyanArcade-TcgImport/1.0 (+card catalog import, cached locally)");
	}

	public JsonNode get(String path) {
		return withRetries("GET " + path,
				() -> this.client.get().uri(path).accept(MediaType.APPLICATION_JSON).retrieve().body(String.class));
	}

	public JsonNode post(String path, Object body) {
		return withRetries("POST " + path,
				() -> this.client.post()
					.uri(path)
					.contentType(MediaType.APPLICATION_JSON)
					.accept(MediaType.APPLICATION_JSON)
					.body(this.json.writeValueAsString(body))
					.retrieve()
					.body(String.class));
	}

	private JsonNode withRetries(String what, Supplier<String> request) {
		RestClientException last = null;
		for (int attempt = 1; attempt <= ATTEMPTS; attempt++) {
			try {
				String body = request.get();
				if (body == null || body.isBlank()) {
					throw new TcgSourceException(what + " answered with nothing");
				}
				return this.json.readTree(body);
			}
			catch (RestClientResponseException ex) {
				if (!ex.getStatusCode().is5xxServerError()) {
					throw new TcgSourceException("%s was refused: %s".formatted(what, ex.getStatusCode()), ex);
				}
				last = ex;
			}
			catch (RestClientException ex) {
				last = ex;
			}
			if (attempt < ATTEMPTS) {
				log.warn("{} failed ({}), trying again", what, last.getMessage());
				pause(attempt);
			}
		}
		throw new TcgSourceException("%s failed %d times; the source may be down".formatted(what, ATTEMPTS), last);
	}

	private void pause(int attempt) {
		try {
			Thread.sleep(this.backoff.multipliedBy(attempt));
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new TcgSourceException("Interrupted while waiting to try again", ex);
		}
	}

}
