package handler

import (
	"fmt"
	"net/http"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/handpose/ingestion/internal/storage"
)

type UploadHandler struct {
	storage *storage.GCSClient
}

func NewUploadHandler(s *storage.GCSClient) *UploadHandler {
	return &UploadHandler{storage: s}
}

func (h *UploadHandler) HandleUpload(c *gin.Context) {
	// Multipart form
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}

	sessionID := c.PostForm("session_id")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_id is required"})
		return
	}

	// Open the file
	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open file"})
		return
	}
	defer src.Close()

	// Upload to GCS
	// We prefix with dev-handpose/ as requested implicitly by the user's path structure
	// stored relative to sessionID
	// e.g., dev-handpose/sessions/{sessionID}/filename
	filename := filepath.Base(file.Filename)
	gcsPath, err := h.storage.UploadResponse(c.Request.Context(), "dev-handpose/sessions/"+sessionID, filename, src)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to upload: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "File uploaded successfully",
		"path":    gcsPath,
	})
}
