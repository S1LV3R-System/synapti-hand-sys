from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import logging

app = FastAPI(title="HandPose Analysis Service", version="1.0.0")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AnalysisRequest(BaseModel):
    session_id: str
    csv_path: str

class AnalysisResponse(BaseModel):
    session_id: str
    metrics: dict

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_session(request: AnalysisRequest):
    logger.info(f"Analyzing session: {request.session_id}")
    
    # Placeholder for actual analysis logic
    # In real impl, this would download CSV from GCS and calc metrics
    
    mock_metrics = {
        "tremor_freq": 0.0,
        "smoothness": 0.95,
        "rom_index": 85.0
    }
    
    return AnalysisResponse(
        session_id=request.session_id,
        metrics=mock_metrics
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
