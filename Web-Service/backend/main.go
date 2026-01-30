package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var startTime = time.Now()

// -- Database Models --

type User struct {
	gorm.Model
	Email             string `gorm:"uniqueIndex"`
	Password          string
	FullName          string
	PhoneNumber       string
	HospitalInstitute string
	Department        string
	IsApproved        bool `gorm:"default:false"`
}

type Project struct {
	gorm.Model
	Name        string
	Description string
	UserID      uint
}

type Patient struct {
	gorm.Model
	PatientID   string
	Name        string
	Gender      string
	DateOfBirth string // Simplified date str for MVP
	Height      float64
	Weight      float64
	ProjectID   uint
}

type Recording struct {
	gorm.Model
	PatientID     uint
	VideoPath     string
	KeypointsPath string
	Status        string // "uploaded", "processing", "completed"
}

// -- Handlers --

type Server struct {
	db *gorm.DB
}

func (s *Server) Login(c *gin.Context) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := c.BindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	var user User
	result := s.db.Where("email = ?", body.Email).First(&user)
	if result.Error != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	if user.Password != body.Password {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	if !user.IsApproved {
		// For MVP, auto-approve admin, else wait
		if user.Email != "admin@handpose.com" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Account waiting for approval"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"email":   user.Email,
		"name":    user.FullName,
	})
}

func (s *Server) Register(c *gin.Context) {
	var body struct {
		Email             string `json:"email"`
		Password          string `json:"password"`
		FullName          string `json:"full_name"`
		PhoneNumber       string `json:"phone_number"`
		HospitalInstitute string `json:"hospital_institute"`
		Department        string `json:"department"`
	}

	if err := c.BindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	user := User{
		Email:             body.Email,
		Password:          body.Password,
		FullName:          body.FullName,
		PhoneNumber:       body.PhoneNumber,
		HospitalInstitute: body.HospitalInstitute,
		Department:        body.Department,
		IsApproved:        false, // Default to pending
	}

	result := s.db.Create(&user)
	if result.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User already exists"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Waiting approval..."})
}

func (s *Server) CreateProject(c *gin.Context) {
	// MVP: Assume auth user is found via some token/session.
	// For now, we'll just mock user ID 1 (admin)
	userID := 1

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	proj := Project{
		Name:        body.Name,
		Description: body.Description,
		UserID:      uint(userID),
	}
	s.db.Create(&proj)

	c.JSON(http.StatusCreated, proj)
}

func (s *Server) ListProjects(c *gin.Context) {
	var projects []Project
	s.db.Find(&projects)
	c.JSON(http.StatusOK, projects)
}

func (s *Server) CreatePatient(c *gin.Context) {
	var body struct {
		PatientID   string  `json:"patient_id"`
		Name        string  `json:"name"`
		Gender      string  `json:"gender"`
		DateOfBirth string  `json:"dob"`
		Height      float64 `json:"height"`
		Weight      float64 `json:"weight"`
		ProjectID   uint    `json:"project_id"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	patient := Patient{
		PatientID:   body.PatientID,
		Name:        body.Name,
		Gender:      body.Gender,
		DateOfBirth: body.DateOfBirth,
		Height:      body.Height,
		Weight:      body.Weight,
		ProjectID:   body.ProjectID,
	}
	s.db.Create(&patient)

	c.JSON(http.StatusCreated, patient)
}

func (s *Server) ListPatients(c *gin.Context) {
	projectID := c.Query("project_id")
	var patients []Patient
	if projectID != "" {
		s.db.Where("project_id = ?", projectID).Find(&patients)
	} else {
		s.db.Find(&patients)
	}
	c.JSON(http.StatusOK, patients)
}

func (s *Server) UploadRecording(c *gin.Context) {
	patientIDStr := c.Param("id")
	patientID, err := strconv.Atoi(patientIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid patient ID"})
		return
	}

	// 1. Get files
	videoFile, err := c.FormFile("video")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video file missing"})
		return
	}

	keypointsFile, err := c.FormFile("keypoints")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Keypoints file missing"})
		return
	}

	// 2. Prepare storage paths
	// Find Patient to get Project ID
	var patient Patient
	if err := s.db.First(&patient, patientID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Patient not found"})
		return
	}

	// data/projects/{project_id}/{patient_id}/{timestamp}/
	ts := time.Now().Format("20060102-150405")
	uploadDir := filepath.Join("data", "projects", fmt.Sprintf("%d", patient.ProjectID), patient.PatientID, ts)
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create directory"})
		return
	}

	videoPath := filepath.Join(uploadDir, "recording.webm")
	keypointsPath := filepath.Join(uploadDir, "keypoints.json")

	// 3. Save files
	if err := c.SaveUploadedFile(videoFile, videoPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save video"})
		return
	}
	if err := c.SaveUploadedFile(keypointsFile, keypointsPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save keypoints"})
		return
	}

	// 4. Record in DB
	recording := Recording{
		PatientID:     uint(patientID),
		VideoPath:     videoPath,
		KeypointsPath: keypointsPath,
		Status:        "uploaded",
	}
	s.db.Create(&recording)

	c.JSON(http.StatusCreated, recording)
}

func (s *Server) ListRecordings(c *gin.Context) {
	patientID := c.Param("id")
	var recordings []Recording
	s.db.Where("patient_id = ?", patientID).Find(&recordings)
	c.JSON(http.StatusOK, recordings)
}

// -- Main --

func main() {
	db, err := gorm.Open(sqlite.Open("users.db"), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}
	// Migrate all models
	db.AutoMigrate(&User{}, &Project{}, &Patient{}, &Recording{})

	// Seed Admin
	var count int64
	db.Model(&User{}).Count(&count)
	if count == 0 {
		db.Create(&User{
			Email:      "admin@handpose.com",
			Password:   "admin",
			FullName:   "System Admin",
			IsApproved: true,
		})
	}

	server := &Server{db: db}

	r := gin.New()
	r.Use(gin.Recovery())
	// Simple logger
	r.Use(func(c *gin.Context) {
		log.Printf("%s %s", c.Request.Method, c.Request.URL.Path)
		c.Next()
	})

	// Max upload size 100MB
	r.MaxMultipartMemory = 100 << 20

	api := r.Group("/api")
	{
		api.POST("/login", server.Login)
		api.POST("/register", server.Register)
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok"})
		})

		// Projects
		api.GET("/projects", server.ListProjects)
		api.POST("/projects", server.CreateProject)

		// Patients
		api.GET("/patients", server.ListPatients)
		api.POST("/patients", server.CreatePatient)

		// Recordings
		api.GET("/patients/:id/recordings", server.ListRecordings)
		api.POST("/patients/:id/recordings", server.UploadRecording)
	}

	staticPath := "../frontend/dist"
	r.Static("/assets", filepath.Join(staticPath, "assets"))

	// Serve uploaded data for viewing (protected ideally, but public for MVP)
	r.Static("/data", "./data")

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api") {
			c.JSON(http.StatusNotFound, gin.H{"error": "API route not found"})
			return
		}
		c.File(filepath.Join(staticPath, "index.html"))
	})

	log.Println("Starting Web-Service on http://localhost:4856")
	if err := r.Run(":4856"); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
