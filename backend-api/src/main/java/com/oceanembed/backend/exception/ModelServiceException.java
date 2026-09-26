package com.oceanembed.backend.exception;

/**
 * Thrown when the FastAPI ML service cannot be reached or returns
 * an unsuccessful response.
 */
public class ModelServiceException extends RuntimeException {

    private final Integer statusCode;

    public ModelServiceException(String message) {
        super(message);
        this.statusCode = null;
    }

    public ModelServiceException(String message, Integer statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    public ModelServiceException(String message, Throwable cause) {
        super(message, cause);
        this.statusCode = null;
    }

    public Integer getStatusCode() {
        return statusCode;
    }
}