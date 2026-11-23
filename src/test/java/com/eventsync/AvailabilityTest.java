package com.eventsync;

import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class AvailabilityTest {
    @Test void dstWeeksAndRepeatedLocalHours(){
        assertThat(AvailabilityController.slots(LocalDate.parse("2026-03-02"),"America/Chicago")).hasSize(167);
        assertThat(AvailabilityController.slots(LocalDate.parse("2026-10-26"),"America/Chicago")).hasSize(169);
        assertThat(AvailabilityController.slots(LocalDate.parse("2026-10-19"),"America/Chicago")).hasSize(168);
    }
    @Test void adjacentBusyDoesNotBlockButPartialOverlapDoes(){
        Instant t=Instant.parse("2030-01-07T10:00:00Z");
        var slot=new AvailabilityController.Range(t,t.plusSeconds(3600));
        assertThat(AvailabilityController.isFree(slot,List.of(slot),List.of(new AvailabilityController.Range(t.minusSeconds(3600),t)))).isTrue();
        assertThat(AvailabilityController.isFree(slot,List.of(slot),List.of(new AvailabilityController.Range(t.plusSeconds(3599),t.plusSeconds(7200))))).isFalse();
        assertThat(AvailabilityController.isFree(slot,List.of(),List.of())).isFalse();
    }
    @Test void adjacentManualSelectionsCoverDifferentTimezoneBoundaries(){
        Instant t=Instant.parse("2030-01-07T10:00:00Z");var slot=new AvailabilityController.Range(t,t.plusSeconds(3600));
        var manual=List.of(new AvailabilityController.Range(t.minusSeconds(1800),t.plusSeconds(1800)),new AvailabilityController.Range(t.plusSeconds(1800),t.plusSeconds(5400)));
        assertThat(AvailabilityController.isFree(slot,manual,List.of())).isTrue();
    }
}
