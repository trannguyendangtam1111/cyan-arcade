package com.cyan.arcade.tcg.administration;

import java.util.Optional;

import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.tcg.game.PilotCatalogLock;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class YugiohReadinessTests {

	private final YugiohPilotStore store = mock(YugiohPilotStore.class);

	private YugiohPilotService service(boolean allowed) {
		return new YugiohPilotService(this.store, mock(PilotCatalogLock.class), JsonMapper.builder().build(),
				new ClassPathResource("tcg/pilots/yugioh.json"), allowed);
	}

	@Test
	void aMissingImportIsNotReady() {
		when(this.store.game()).thenReturn(Optional.empty());
		var readiness = service(true).readiness();
		assertThat(readiness.dataValid()).isFalse();
		assertThat(readiness.counts().printings()).isZero();
		assertThat(readiness.problems()).containsExactly("Import the hidden Yu-Gi-Oh! pilot first");
		assertThatExceptionOfType(NotFoundException.class).isThrownBy(() -> service(true).setVisible(true, 1L));
	}

	@Test
	void theEnvironmentGateIsIndependentOfTheSourceAndCatalog() {
		assertThatExceptionOfType(ConflictException.class).isThrownBy(() -> service(false).setVisible(true, 1L))
			.withMessageContaining("disabled in this environment");
	}
}
