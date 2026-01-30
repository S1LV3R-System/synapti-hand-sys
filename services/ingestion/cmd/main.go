package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/handpose/ingestion/internal/config"
	"github.com/handpose/ingestion/internal/handler"
	"github.com/handpose/ingestion/internal/storage"
)

func main() {
	cfg := config.Load()

	// Init GCS
	gcsClient, err := storage.NewGCSClient(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize GCS client: %v", err)
	}
	defer gcsClient.Close()

	// Router
	r := gin.Default()
	
	// Handlers
	uploadHandler := handler.NewUploadHandler(gcsClient)
	
	// Routes
	v1 := r.Group("/v1")
	{
		v1.POST("/upload", uploadHandler.HandleUpload)
		v1.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok"})
		})
	}

	log.Printf("Starting Ingestion Service on port %s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
