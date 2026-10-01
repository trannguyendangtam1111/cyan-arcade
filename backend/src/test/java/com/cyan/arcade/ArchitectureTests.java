package com.cyan.arcade;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition;
import jakarta.persistence.Entity;

import org.springframework.web.bind.annotation.RestController;

import static com.tngtech.archunit.base.DescribedPredicate.not;
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

}
