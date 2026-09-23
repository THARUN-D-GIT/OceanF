package com.oceanembed.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(
            MethodArgumentNotValidException ex) {

        Map<String, Object> body = new HashMap<>();
        Map<String, String> fieldErrors = new HashMap<>();

        ex.getBindingResult()
                .getFieldErrors()
                .forEach(fe ->
                        fieldErrors.put(
                                fe.getField(),
                                fe.getDefaultMessage()
                        )
                );

        body.put("timestamp", Instant.now().toString());
        body.put("status", HttpStatus.BAD_REQUEST.value());
        body.put("error", "Validation failed");
        body.put("fields", fieldErrors);

        return ResponseEntity
                .badRequest()
                .body(body);
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(
            ResourceNotFoundException ex) {

        return errorResponse(
                HttpStatus.NOT_FOUND,
                ex.getMessage()
        );
    }

    @ExceptionHandler(ModelServiceException.class)
    public ResponseEntity<Map<String, Object>> handleModelService(
            ModelServiceException ex) {

        Integer statusCode = ex.getStatusCode();

        /*
         * 400/422 from FastAPI means the request itself is invalid
         * or cannot be processed for the requested data/domain.
         *
         * Examples:
         * - unsupported date
         * - unavailable spatial tile
         * - invalid ML request
         */
        if (statusCode != null
                && (statusCode == 400 || statusCode == 422)) {

            return errorResponse(
                    HttpStatus.BAD_REQUEST,
                    extractClientMessage(ex.getMessage())
            );
        }

        /*
         * No HTTP response from FastAPI means the service may be
         * unreachable or otherwise unavailable.
         */
        return errorResponse(
                HttpStatus.BAD_GATEWAY,
                ex.getMessage()
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(
            Exception ex) {

        return errorResponse(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Unexpected error: " + ex.getMessage()
        );
    }

    private String extractClientMessage(String message) {

        if (message == null || message.isBlank()) {
            return "OceanEmbed request could not be processed";
        }

        /*
         * FastAPI currently returns JSON for validation errors.
         * Preserve the complete ML-service message rather than
         * attempting to parse and potentially lose useful details.
         */
        return message;
    }

    private ResponseEntity<Map<String, Object>> errorResponse(
            HttpStatus status,
            String message) {

        Map<String, Object> body = new HashMap<>();

        body.put(
                "timestamp",
                Instant.now().toString()
        );

        body.put(
                "status",
                status.value()
        );

        body.put(
                "error",
                message
        );

        return ResponseEntity
                .status(status)
                .body(body);
    }
}