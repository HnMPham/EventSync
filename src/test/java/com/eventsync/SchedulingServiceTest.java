package com.eventsync;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class SchedulingServiceTest {
    private static Instant t(String s){return Instant.parse(s);}
    private static SchedulingService.Interval range(String start,String end){return new SchedulingService.Interval(t(start),t(end));}
    private static final SchedulingService.Interval MEETING=range("2030-01-01T10:00:00Z","2030-01-01T11:00:00Z");
    private static final List<SchedulingService.Interval> CHOSEN=List.of(MEETING);
    private static final List<SchedulingService.Interval> BUSY=List.of(range("2030-01-01T10:15:00Z","2030-01-01T10:45:00Z"));
    @Test void manualAvailabilityRequired(){
        assertThat(SchedulingService.isAvailable(MEETING,List.of(),List.of(),List.of())).isFalse();
        assertThat(SchedulingService.isAvailable(MEETING,CHOSEN,List.of(),List.of())).isTrue();
        assertThat(SchedulingService.isAvailable(MEETING,CHOSEN,BUSY,List.of())).isFalse();
    }
    @Test void explicitFreeOverridesOutlookBusyWhenCoveringConflict(){
        var overrides=List.of(new SchedulingService.Override(BUSY.getFirst(),"AVAILABLE"));
        assertThat(SchedulingService.isAvailable(MEETING,CHOSEN,BUSY,overrides)).isTrue();
        assertThat(SchedulingService.isAvailable(MEETING,List.of(),BUSY,overrides)).isFalse();
    }
    @Test void manualBusyOverridesEvenWithoutExternalMeetings(){
        var overrides=List.of(new SchedulingService.Override(range("2030-01-01T10:30:00Z","2030-01-01T11:00:00Z"),"BUSY"));
        assertThat(SchedulingService.isAvailable(MEETING,CHOSEN,List.of(),overrides)).isFalse();
    }
    @Test void adjacentIntervalsCountAsContinuousAvailability(){
        var parts=List.of(range("2030-01-01T10:00:00Z","2030-01-01T10:30:00Z"),range("2030-01-01T10:30:00Z","2030-01-01T11:00:00Z"));
        assertThat(SchedulingService.isAvailable(MEETING,parts,List.of(),List.of())).isTrue();
    }
}
