"""
Multi-Head LSTM Model for Hand Pose Classification
"One Brain, Four Mouths" Architecture

Architecture Philosophy:
- Shared LSTM backbone learns temporal hand movement patterns
- Four separate output heads for different detection tasks
- Enables efficient single-pass prediction for all tasks
"""

import tensorflow as tf
from tensorflow.keras import layers, models, Model, optimizers, callbacks
import numpy as np


class MultiHeadLSTMModel:
    """
    Multi-head LSTM network for hand pose classification.

    Architecture:
        Input (sequence_length, num_features)
        ↓
        [Optional Bidirectional] LSTM(lstm_units, return_sequences=True)
        ↓
        Dropout(dropout_rate)
        ↓
        LSTM(lstm_units)
        ↓
        Dropout(dropout_rate)
        ↓
        ┌────────────┬────────────┬────────────┬────────────┐
        ↓            ↓            ↓            ↓            ↓
     Wrist Head  Finger Head  Posture Head  State Head
    """

    def __init__(self, config):
        """
        Args:
            config: Configuration dictionary with keys:
                - sequence_length: Number of frames in each sequence (default: 30)
                - num_features: Number of features per frame (default: 66)
                - lstm_units: Number of LSTM units (default: 64)
                - dropout_rate: Dropout rate (default: 0.3)
                - bidirectional: Use bidirectional LSTM (default: False)
                - learning_rate: Learning rate for optimizer (default: 0.001)
                - num_classes: Dict with class counts per head
        """
        self.config = {
            'sequence_length': 30,
            'num_features': 66,  # 63 landmarks + 3 metadata
            'lstm_units': 64,
            'dropout_rate': 0.3,
            'bidirectional': False,  # Set True for offline analysis, False for real-time
            'learning_rate': 0.001,
            **config  # Override defaults with provided config
        }

        self.model = None
        self.history = None

    def build_model(self):
        """
        Build multi-head LSTM model.

        Returns:
            model: Keras Model with 4 outputs
        """
        print("\n" + "="*70)
        print(" BUILDING MULTI-HEAD LSTM MODEL")
        print("="*70)

        input_shape = (self.config['sequence_length'], self.config['num_features'])
        num_classes = self.config['num_classes']

        print(f"\nConfiguration:")
        print(f"  Input shape: {input_shape}")
        print(f"  LSTM units: {self.config['lstm_units']}")
        print(f"  Dropout rate: {self.config['dropout_rate']}")
        print(f"  Bidirectional: {self.config['bidirectional']}")
        print(f"  Learning rate: {self.config['learning_rate']}")
        print(f"\nOutput heads:")
        for head_name, n_classes in num_classes.items():
            print(f"  - {head_name:10s}: {n_classes} classes")

        # Input layer
        input_layer = layers.Input(shape=input_shape, name='input')

        # --- SHARED LSTM BACKBONE ("The Brain") ---
        x = input_layer

        # First LSTM layer
        # Use recurrent_activation='sigmoid' for GPU compatibility
        if self.config['bidirectional']:
            x = layers.Bidirectional(
                layers.LSTM(self.config['lstm_units'], return_sequences=True,
                           recurrent_activation='sigmoid'),
                name='bidirectional_lstm_1'
            )(x)
        else:
            x = layers.LSTM(
                self.config['lstm_units'],
                return_sequences=True,
                recurrent_activation='sigmoid',
                name='lstm_1'
            )(x)

        x = layers.Dropout(self.config['dropout_rate'], name='dropout_1')(x)

        # Second LSTM layer (final output)
        x = layers.LSTM(self.config['lstm_units'],
                       recurrent_activation='sigmoid',
                       name='lstm_2')(x)
        x = layers.Dropout(self.config['dropout_rate'], name='dropout_2')(x)

        # --- OUTPUT HEADS ("The Mouths") ---

        # HEAD 1: WRIST ROTATION (Test 1)
        h1 = layers.Dense(32, activation='relu', name='wrist_dense')(x)
        out_wrist = layers.Dense(
            num_classes['wrist'],
            activation='softmax',
            name='wrist_output'
        )(h1)

        # HEAD 2: FINGER ACTIVITY (Test 2)
        h2 = layers.Dense(32, activation='relu', name='finger_dense')(x)
        out_finger = layers.Dense(
            num_classes['finger'],
            activation='softmax',
            name='finger_output'
        )(h2)

        # HEAD 3: POSTURE (Test 3)
        h3 = layers.Dense(32, activation='relu', name='posture_dense')(x)
        out_posture = layers.Dense(
            num_classes['posture'],
            activation='softmax',
            name='posture_output'
        )(h3)

        # HEAD 4: STATE (Test 3)
        h4 = layers.Dense(32, activation='relu', name='state_dense')(x)
        out_state = layers.Dense(
            num_classes['state'],
            activation='softmax',
            name='state_output'
        )(h4)

        # Create model
        self.model = Model(
            inputs=input_layer,
            outputs=[out_wrist, out_finger, out_posture, out_state],
            name='MultiHeadLSTM'
        )

        print("\n✓ Model architecture built successfully")
        print(f"  Total parameters: {self.model.count_params():,}")

        return self.model

    def compile_model(self, class_weights=None):
        """
        Compile model with loss, optimizer, and metrics.

        Args:
            class_weights: Dictionary of class weights per head (optional)
        """
        print("\n" + "-"*70)
        print("Compiling model...")
        print("-"*70)

        # Define losses for each output
        losses = {
            'wrist_output': 'sparse_categorical_crossentropy',
            'finger_output': 'sparse_categorical_crossentropy',
            'posture_output': 'sparse_categorical_crossentropy',
            'state_output': 'sparse_categorical_crossentropy'
        }

        # Define metrics for each output
        metrics = {
            'wrist_output': ['accuracy'],
            'finger_output': ['accuracy'],
            'posture_output': ['accuracy'],
            'state_output': ['accuracy']
        }

        # Loss weights (equal by default, can be tuned)
        loss_weights = {
            'wrist_output': 1.0,
            'finger_output': 1.0,
            'posture_output': 1.0,
            'state_output': 1.0
        }

        # Optimizer
        optimizer = optimizers.Adam(learning_rate=self.config['learning_rate'])

        # Compile
        self.model.compile(
            optimizer=optimizer,
            loss=losses,
            loss_weights=loss_weights,
            metrics=metrics
        )

        print("✓ Model compiled successfully")
        print(f"  Optimizer: Adam (lr={self.config['learning_rate']})")
        print(f"  Loss: sparse_categorical_crossentropy (all heads)")

        if class_weights:
            print("\n  Class weights provided for imbalanced data handling")

    def get_callbacks(self, model_name='multihead_lstm'):
        """
        Create training callbacks.

        Args:
            model_name: Base name for saved models

        Returns:
            callbacks_list: List of Keras callbacks
        """
        callbacks_list = []

        # ModelCheckpoint: Save best model
        checkpoint = callbacks.ModelCheckpoint(
            filepath=f'models/{model_name}_best.h5',
            monitor='val_loss',
            save_best_only=True,
            verbose=1
        )
        callbacks_list.append(checkpoint)

        # EarlyStopping: Stop if no improvement
        early_stop = callbacks.EarlyStopping(
            monitor='val_loss',
            patience=15,
            restore_best_weights=True,
            verbose=1
        )
        callbacks_list.append(early_stop)

        # ReduceLROnPlateau: Reduce learning rate if plateaus
        reduce_lr = callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=7,
            min_lr=1e-6,
            verbose=1
        )
        callbacks_list.append(reduce_lr)

        # TensorBoard: Logging
        tensorboard = callbacks.TensorBoard(
            log_dir=f'models/logs/{model_name}',
            histogram_freq=1
        )
        callbacks_list.append(tensorboard)

        return callbacks_list

    def train(self, X_train, y_train, X_val, y_val,
              epochs=50, batch_size=32, class_weights=None):
        """
        Train the model.

        Args:
            X_train: Training sequences (n_samples, seq_len, features)
            y_train: Dictionary of training labels for each head
            X_val: Validation sequences
            y_val: Dictionary of validation labels for each head
            epochs: Number of training epochs
            batch_size: Batch size for training
            class_weights: Dictionary of class weights per head

        Returns:
            history: Training history
        """
        print("\n" + "="*70)
        print(" TRAINING MULTI-HEAD LSTM MODEL")
        print("="*70)

        print(f"\nTraining configuration:")
        print(f"  Epochs: {epochs}")
        print(f"  Batch size: {batch_size}")
        print(f"  Training samples: {len(X_train)}")
        print(f"  Validation samples: {len(X_val)}")

        # NOTE: Keras multi-output models don't support class_weight parameter
        # Class imbalance is handled through loss_weights in compile_model()
        if class_weights:
            print("\n  ℹ️  Class weights calculated but not directly applied")
            print("     (Multi-output models handle imbalance through loss weighting)")

        # Get callbacks
        callbacks_list = self.get_callbacks()

        # Train
        print("\n" + "-"*70)
        print("Starting training...")
        print("-"*70 + "\n")

        self.history = self.model.fit(
            X_train,
            y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            # class_weight not supported for multi-output models
            callbacks=callbacks_list,
            verbose=1
        )

        print("\n" + "="*70)
        print(" TRAINING COMPLETE")
        print("="*70 + "\n")

        return self.history

    def evaluate(self, X_test, y_test):
        """
        Evaluate model on test data.

        Args:
            X_test: Test sequences
            y_test: Dictionary of test labels for each head

        Returns:
            results: Evaluation results
        """
        print("\n" + "="*70)
        print(" EVALUATING MODEL")
        print("="*70)

        results = self.model.evaluate(X_test, y_test, verbose=1)

        # Parse results
        # results = [total_loss, wrist_loss, finger_loss, posture_loss, state_loss,
        #            wrist_acc, finger_acc, posture_acc, state_acc]

        print("\n" + "-"*70)
        print("Test Results:")
        print("-"*70)
        print(f"  Total Loss: {results[0]:.4f}")
        print(f"\n  Per-Head Performance:")
        print(f"    Wrist Head:")
        print(f"      Loss: {results[1]:.4f}")
        print(f"      Accuracy: {results[5]:.4f} ({results[5]*100:.1f}%)")
        print(f"    Finger Head:")
        print(f"      Loss: {results[2]:.4f}")
        print(f"      Accuracy: {results[6]:.4f} ({results[6]*100:.1f}%)")
        print(f"    Posture Head:")
        print(f"      Loss: {results[3]:.4f}")
        print(f"      Accuracy: {results[7]:.4f} ({results[7]*100:.1f}%)")
        print(f"    State Head:")
        print(f"      Loss: {results[4]:.4f}")
        print(f"      Accuracy: {results[8]:.4f} ({results[8]*100:.1f}%)")
        print("-"*70 + "\n")

        return results

    def predict(self, X):
        """
        Make predictions on new data.

        Args:
            X: Input sequences (n_samples, seq_len, features)

        Returns:
            predictions: Dictionary of predictions for each head
        """
        preds = self.model.predict(X)

        return {
            'wrist': preds[0],
            'finger': preds[1],
            'posture': preds[2],
            'state': preds[3]
        }

    def save_model(self, filepath):
        """
        Save the trained model.

        Args:
            filepath: Path to save model
        """
        self.model.save(filepath)
        print(f"✓ Model saved to {filepath}")

    def load_model(self, filepath):
        """
        Load a pre-trained model.

        Args:
            filepath: Path to saved model
        """
        from tensorflow.keras.models import load_model as keras_load_model

        self.model = keras_load_model(filepath)
        print(f"✓ Model loaded from {filepath}")

    def print_summary(self):
        """Print model architecture summary."""
        if self.model:
            self.model.summary()
        else:
            print("Model not built yet. Call build_model() first.")


if __name__ == "__main__":
    # Test model creation
    print("="*70)
    print(" TESTING MULTI-HEAD LSTM MODEL")
    print("="*70)

    # Example configuration
    config = {
        'sequence_length': 30,
        'num_features': 66,
        'lstm_units': 64,
        'dropout_rate': 0.3,
        'bidirectional': False,
        'learning_rate': 0.001,
        'num_classes': {
            'wrist': 3,
            'finger': 11,
            'posture': 4,
            'state': 3
        }
    }

    # Build model
    model_builder = MultiHeadLSTMModel(config)
    model = model_builder.build_model()

    # Compile
    model_builder.compile_model()

    # Print summary
    print("\n" + "="*70)
    print(" MODEL ARCHITECTURE")
    print("="*70 + "\n")
    model_builder.print_summary()

    print("\n" + "="*70)
    print(" TEST COMPLETE")
    print("="*70 + "\n")
