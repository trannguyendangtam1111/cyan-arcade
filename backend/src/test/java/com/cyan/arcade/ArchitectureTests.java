package com.cyan.arcade;

import com.cyan.arcade.score.GameSessionService;
import com.cyan.arcade.score.RunRules;
import com.cyan.arcade.score.RunSession;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition;
import jakarta.persistence.Entity;

import org.springframework.web.bind.annotation.RestController;

import static com.tngtech.archunit.base.DescribedPredicate.not;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.equivalentTo;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Guards the modular-monolith boundaries described in ARCHITECTURE.md.
 */
@AnalyzeClasses(packages = "com.cyan.arcade", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTests {

	/** Feature packages (game, score, ...) may depend on each other, but never in a circle. */
	@ArchTest
	static final ArchRule featuresAreFreeOfCycles = SlicesRuleDefinition.slices()
		.matching("com.cyan.arcade.(*)..")
		.should()
		.beFreeOfCycles();

	/** The same inside the card game module: its parts (set, card, pack, opening, ...) build on each other one way. */
	@ArchTest
	static final ArchRule tcgPartsAreFreeOfCycles = SlicesRuleDefinition.slices()
		.matching("com.cyan.arcade.tcg.(*)..")
		.should()
		.beFreeOfCycles();

	/**
	 * The card game is a module of its own: the platform and the generic game system do not know it
	 * exists. It may use the platform (accounts, errors), never the other way round.
	 */
	@ArchTest
	static final ArchRule nothingDependsOnTheCardGameModule = noClasses().that()
		.resideOutsideOfPackage("com.cyan.arcade.tcg..")
		.should()
		.dependOnClassesThat()
		.resideInAPackage("com.cyan.arcade.tcg..");

	/** And it keeps to itself: of the platform it uses only the shared infrastructure. */
	@ArchTest
	static final ArchRule theCardGameModuleUsesOnlySharedInfrastructure = noClasses().that()
		.resideInAPackage("com.cyan.arcade.tcg..")
		.should()
		.dependOnClassesThat(resideInAPackage("com.cyan.arcade..").and(not(resideInAPackage("com.cyan.arcade.tcg..")))
			.and(not(resideInAPackage("com.cyan.arcade.common.."))));

	/** {@code common} is shared infrastructure: it must not know about any feature, present or future. */
	@ArchTest
	static final ArchRule commonDoesNotDependOnFeatures = noClasses().that()
		.resideInAPackage("com.cyan.arcade.common..")
		.should()
		.dependOnClassesThat(
				resideInAPackage("com.cyan.arcade..").and(not(resideInAPackage("com.cyan.arcade.common.."))));

	/** Controllers talk to services and DTOs only; entities and repositories stay behind the service. */
	@ArchTest
	static final ArchRule controllersDoNotTouchPersistence = noClasses().that()
		.areAnnotatedWith(RestController.class)
		.should()
		.dependOnClassesThat()
		.areAnnotatedWith(Entity.class)
		.orShould()
		.dependOnClassesThat()
		.haveSimpleNameEndingWith("Repository");

	/**
	 * Passwords are handled in exactly one place. Only {@code auth} may use the password encoder or
	 * ask for stored credentials.
	 */
	@ArchTest
	static final ArchRule onlyAuthHandlesPasswords = noClasses().that()
		.resideOutsideOfPackages("com.cyan.arcade.auth..", "com.cyan.arcade.user..")
		.should()
		.dependOnClassesThat()
		.haveFullyQualifiedName("com.cyan.arcade.user.UserCredentials")
		.orShould()
		.dependOnClassesThat()
		.haveFullyQualifiedName("org.springframework.security.crypto.password.PasswordEncoder");

	/**
	 * A game's server-side rules ({@code gamerules}) are about its runs and nothing else. Of the
	 * platform they may use only the contract a game implements, {@link RunRules}: never coins,
	 * rewards, achievements, leaderboards, inventories or accounts, which the platform handles for
	 * every game alike.
	 */
	@ArchTest
	static final ArchRule gameRulesUseOnlyTheGameContract = noClasses().that()
		.resideInAPackage("com.cyan.arcade.gamerules..")
		.should()
		.dependOnClassesThat(resideInAPackage("com.cyan.arcade..").and(not(resideInAPackage("com.cyan.arcade.gamerules..")))
			.and(not(equivalentTo(RunRules.class))));

	/**
	 * Word Guess is played on the server (the hidden word must not reach the browser), so it is a
	 * module of its own, like the card game: nothing outside it knows it exists.
	 */
	@ArchTest
	static final ArchRule nothingDependsOnTheWordGuessModule = noClasses().that()
		.resideOutsideOfPackage("com.cyan.arcade.wordle..")
		.should()
		.dependOnClassesThat()
		.resideInAPackage("com.cyan.arcade.wordle..");

	/**
	 * Of the platform it uses the shared infrastructure and the game contract only: its
	 * {@link RunRules}, and the read-only view of the game session a run is tied to. Rewards,
	 * achievements, leaderboards and coins are the platform's, as for every game.
	 */
	@ArchTest
	static final ArchRule theWordGuessModuleUsesOnlyTheGameContract = noClasses().that()
		.resideInAPackage("com.cyan.arcade.wordle..")
		.should()
		.dependOnClassesThat(resideInAPackage("com.cyan.arcade..").and(not(resideInAPackage("com.cyan.arcade.wordle..")))
			.and(not(resideInAPackage("com.cyan.arcade.common..")))
			.and(not(equivalentTo(RunRules.class)))
			.and(not(equivalentTo(GameSessionService.class)))
			.and(not(equivalentTo(RunSession.class))));

	/**
	 * Its rules, word lists, daily schedule and AI are plain Java, testable on their own: no Spring,
	 * no web, no database, nothing of the platform.
	 */
	@ArchTest
	static final ArchRule theWordGuessGameIsPlainJava = noClasses().that()
		.resideInAnyPackage("com.cyan.arcade.wordle.engine..", "com.cyan.arcade.wordle.dictionary..",
				"com.cyan.arcade.wordle.daily..", "com.cyan.arcade.wordle.ai..")
		.should()
		.dependOnClassesThat()
		.resideInAnyPackage("org.springframework..", "jakarta..", "com.cyan.arcade.common..", "com.cyan.arcade.score..");

	/** The AI plays by the engine's rules; the engine knows nothing of the AI, the word lists or the calendar. */
	@ArchTest
	static final ArchRule theWordGuessEngineStandsAlone = noClasses().that()
		.resideInAPackage("com.cyan.arcade.wordle.engine..")
		.should()
		.dependOnClassesThat()
		.resideInAnyPackage("com.cyan.arcade.wordle.ai..", "com.cyan.arcade.wordle.dictionary..",
				"com.cyan.arcade.wordle.daily..");

	/**
	 * And the platform knows no particular game: it finds a game's rules by its slug, so adding a
	 * game changes nothing outside {@code gamerules} and the catalogs.
	 */
	@ArchTest
	static final ArchRule thePlatformDependsOnNoGamesRules = noClasses().that()
		.resideOutsideOfPackage("com.cyan.arcade.gamerules..")
		.should()
		.dependOnClassesThat()
		.resideInAPackage("com.cyan.arcade.gamerules..");

}
