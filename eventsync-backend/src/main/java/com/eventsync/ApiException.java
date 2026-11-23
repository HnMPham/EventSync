package com.eventsync;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.converter.HttpMessageNotReadableException;

public class ApiException extends RuntimeException {
    final HttpStatus status;
    public ApiException(HttpStatus status, String message) { super(message); this.status = status; }
    static ApiException bad(String message) { return new ApiException(HttpStatus.BAD_REQUEST, message); }
    static ApiException forbidden() { return new ApiException(HttpStatus.FORBIDDEN, "You do not have access to this resource"); }
    static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "Resource not found"); }
}

@RestControllerAdvice
class Errors {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<?> api(ApiException e) { return ResponseEntity.status(e.status).body(Map.of("error", e.getMessage())); }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> validation(MethodArgumentNotValidException e) {
        var errors = e.getBindingResult().getFieldErrors().stream().map(f -> f.getField()+": "+f.getDefaultMessage()).toList();
        return ResponseEntity.badRequest().body(Map.of("error", "Invalid request", "details", errors));
    }
    @ExceptionHandler({IllegalArgumentException.class, java.time.DateTimeException.class, MethodArgumentTypeMismatchException.class, HttpMessageNotReadableException.class})
    ResponseEntity<?> invalid(Exception e) { return ResponseEntity.badRequest().body(Map.of("error", "Invalid value or request format")); }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict(Exception e) { return ResponseEntity.status(409).body(Map.of("error", "Conflicting update; reload and try again")); }
}
