import os
import json
import logging
from google.cloud import storage
import pandas as pd
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ProcessingPipeline:
    def __init__(self):
        self.gcs_client = storage.Client.from_service_account_json(
            "/home/shivam/Desktop/HandPose/GCS key/coral-shoreline-435307-k0-0d200fc43406.json"
        )
        self.bucket_name = "coral-shoreline-435307-k0.firebasestorage.app"
    
    def process_session(self, session_id: str, csv_path: str):
        logger.info(f"Starting processing for session {session_id}")
        
        # 1. Download CSV
        bucket = self.gcs_client.bucket(self.bucket_name)
        blob = bucket.blob(csv_path)
        
        local_csv = f"/tmp/{session_id}.csv"
        blob.download_to_filename(local_csv)
        
        # 2. Process Data (Placeholder for 40+ filters)
        df = pd.read_csv(local_csv)
        processed_df = self.apply_filters(df)
        
        # 3. Upload Processed Data
        output_path = f"dev-handpose/processed/{session_id}_processed.csv"
        self.save_processed(processed_df, output_path)
        
        return output_path

    def apply_filters(self, df: pd.DataFrame) -> pd.DataFrame:
        # Example: Simple moving average for now
        # Real implementation will load claude_settings.json
        if 'x' in df.columns:
            df['x_smoothed'] = df['x'].rolling(window=5).mean()
        return df

    def save_processed(self, df: pd.DataFrame, path: str):
        output_csv = f"/tmp/processed_temp.csv"
        df.to_csv(output_csv, index=False)
        
        bucket = self.gcs_client.bucket(self.bucket_name)
        blob = bucket.blob(path)
        blob.upload_from_filename(output_csv)
        logger.info(f"Uploaded processed data to {path}")

if __name__ == "__main__":
    # Test run
    pipeline = ProcessingPipeline()
    # pipeline.process_session("test_session", "dev-handpose/sessions/test/data.csv")
