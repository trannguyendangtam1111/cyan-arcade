package com.cyan.arcade;

import org.springframework.boot.SpringApplication;

/** Runs the app locally against a throwaway Testcontainers PostgreSQL (no docker-compose needed). */
public class TestCyanArcadeApplication {

	public static void main(String[] args) {
		SpringApplication.from(CyanArcadeApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
