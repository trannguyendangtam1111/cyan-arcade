package com.cyan.arcade.tcg.dataimport;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** Reading from a source that is sometimes unwell. */
class SourceHttpTests {

	private static final String URL = "https://source.example/data";

	private MockRestServiceServer server;

	private SourceHttp http;

	@BeforeEach
	void setUp() {
		RestClient.Builder builder = RestClient.builder().baseUrl(URL);
		this.server = MockRestServiceServer.bindTo(builder).build();
		this.http = new SourceHttp(builder.build(), JsonMapper.builder().build(), Duration.ZERO);
	}

	@Test
	void triesAgainWhenTheSourceHasAMomentaryProblem() {
		this.server.expect(requestTo(URL + "/packs.json")).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
		this.server.expect(requestTo(URL + "/packs.json")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
		this.server.expect(requestTo(URL + "/packs.json"))
			.andRespond(withSuccess("{\"ok\":true}", MediaType.APPLICATION_JSON));

		assertThat(this.http.get("/packs.json").path("ok").asBoolean()).isTrue();
		this.server.verify();
	}

	@Test
	void givesUpAfterAFewAttempts() {
		this.server.expect(ExpectedCount.times(4), requestTo(URL + "/packs.json"))
			.andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> this.http.get("/packs.json"))
			.withMessageContaining("failed 4 times");
		this.server.verify();
	}

	@Test
	void aRefusalIsNotRetried() {
		this.server.expect(ExpectedCount.once(), requestTo(URL + "/missing.json"))
			.andRespond(withStatus(HttpStatus.NOT_FOUND));

		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> this.http.get("/missing.json"))
			.withMessageContaining("refused")
			.withMessageContaining("404");
		this.server.verify();
	}

	@Test
	void anEmptyAnswerIsAnError() {
		this.server.expect(requestTo(URL + "/empty.json")).andRespond(withSuccess("", MediaType.APPLICATION_JSON));

		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> this.http.get("/empty.json"))
			.withMessageContaining("answered with nothing");
	}

}
