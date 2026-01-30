package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	"cloud.google.com/go/storage"
	"github.com/handpose/ingestion/internal/config"
	"google.golang.org/api/option"
)

type GCSClient struct {
	client *storage.Client
	bucket string
}

func NewGCSClient(cfg *config.Config) (*GCSClient, error) {
	ctx := context.Background()
	client, err := storage.NewClient(ctx, option.WithCredentialsFile(cfg.CredentialsPath))
	if err != nil {
		return nil, fmt.Errorf("failed to create client: %v", err)
	}

	return &GCSClient{
		client: client,
		bucket: cfg.GCSBucket,
	}, nil
}

func (g *GCSClient) UploadResponse(ctx context.Context, sessionID string, filename string, content io.Reader) (string, error) {
	objectName := fmt.Sprintf("sessions/%s/%s", sessionID, filename)
	wc := g.client.Bucket(g.bucket).Object(objectName).NewWriter(ctx)
	
	if _, err := io.Copy(wc, content); err != nil {
		return "", fmt.Errorf("io.Copy: %v", err)
	}
	
	if err := wc.Close(); err != nil {
		return "", fmt.Errorf("Writer.Close: %v", err)
	}

	return fmt.Sprintf("gs://%s/%s", g.bucket, objectName), nil
}

func (g *GCSClient) Close() error {
	return g.client.Close()
}
