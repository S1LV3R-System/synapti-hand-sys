from fastapi import FastAPI, Request
from pydantic import BaseModel
import uvicorn
import logging
from datetime import datetime
import os

# Setup logging
if not os.path.exists("logs"):
    os.makedirs("logs")

logging.basicConfig(
    filename="logs/app_errors.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

app = FastAPI(title="HandPose Monitor Server")

class ErrorLog(BaseModel):
    timestamp: int
    level: str
    tag: str
    message: str
    stackTrace: str | None = None
    deviceInfo: str | None = None

@app.get("/")
def read_root():
    return {"status": "running", "message": "HandPose Monitor Server is Active"}

@app.post("/logs")
async def receive_log(error_log: ErrorLog):
    log_entry = f"[{error_log.tag}] {error_log.message}"
    if error_log.stackTrace:
        log_entry += f"\nStack Trace:\n{error_log.stackTrace}"
    if error_log.deviceInfo:
        log_entry += f"\nDevice: {error_log.deviceInfo}"
    
    print(f"Received Log: {log_entry}")
    
    if error_log.level.upper() == "ERROR":
        logging.error(log_entry)
    elif error_log.level.upper() == "WARN":
        logging.warning(log_entry)
    else:
        logging.info(log_entry)

    return {"status": "logged"}

if __name__ == "__main__":
    # HOST 0.0.0.0 is crucial for Android Emulator access via 10.0.2.2
    uvicorn.run(app, host="0.0.0.0", port=8000)
