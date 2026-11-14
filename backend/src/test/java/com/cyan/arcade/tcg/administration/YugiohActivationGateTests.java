package com.cyan.arcade.tcg.administration;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohPackFixture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class YugiohActivationGateTests {

	@Autowired private MockMvc mvc;
	@Autowired private TcgDatasetImporter importer;

	@Test
	void defaultEnvironmentRefusesActivationButAllowsDeactivation() throws Exception {
		this.importer.importDataset(YugiohPackFixture.dataset("yugioh"), "default-off fixture");
		var admin = Players.signInAsAdmin(this.mvc);
		this.mvc.perform(get("/api/admin/tcg/pilots/yugioh").session(admin))
			.andExpect(jsonPath("$.activationAllowed").value(false)).andExpect(jsonPath("$.dataValid").value(true));
		this.mvc.perform(put("/api/admin/tcg/pilots/yugioh/visibility").session(admin).with(csrf())
			.contentType(MediaType.APPLICATION_JSON).content("{\"active\":true}"))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PILOT_ACTIVATION_DISABLED"));
		this.mvc.perform(put("/api/admin/tcg/pilots/yugioh/visibility").session(admin).with(csrf())
			.contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.gameActive").value(false));
	}
}
