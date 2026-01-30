package config

import (
	"os"
)

type Config struct {
	Port            string
	GCSBucket       string
	CredentialsPath string
}

func Load() *Config {
	return &Config{
		Port:            getEnv("PORT", "8080"),
		GCSBucket:       "coral-shoreline-435307-k0.firebasestorage.app", // Using the bucket from user request (stem)
		CredentialsPath: "/home/shivam/Desktop/HandPose/GCS key/coral-shoreline-435307-k0-0d200fc43406.json",
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
