# vLLM Model Deployment & Optimization Guide

This comprehensive reference provides enterprise-grade configuration parameters for optimal deployment of PyTorch models using vLLM across various GPU architectures. These settings have been benchmarked and validated to ensure maximum performance, reliability, and resource efficiency in production environments.

## Introduction to vLLM-Powered Inference

Scalytics Copilot now uses **vLLM** (Very Fast LLM) as the unified inference engine for all local models. vLLM provides state-of-the-art serving throughput with dynamic batching, optimized attention mechanisms, and efficient memory management. All models are downloaded in PyTorch format from HuggingFace and automatically optimized by vLLM.

## Key vLLM Advantages

- **Up to 24x Higher Throughput**: Compared to traditional inference methods
- **Dynamic Batching**: Automatically optimizes request batching
- **PagedAttention**: Efficient KV-cache memory management  
- **Zero Configuration**: Models work out-of-the-box with optimal settings
- **Hardware-Aware**: Automatically detects and utilizes available GPUs

## Model Format & Architecture

**Supported Model Types:**
- ✅ **PyTorch/Transformers** models from HuggingFace Hub
- ✅ **Safetensors** format (preferred for security and speed)
- ✅ **Multi-modal models** (text + vision capabilities)
- ❌ **Legacy model formats** (e.g., GGUF) are no longer supported.

## Default Inference Parameters

Scalytics Copilot uses the following optimized default parameters for vLLM inference:

| Parameter | Default Value | Description |
|-----------|--------------|-------------|
| Temperature | 0.7 | Controls randomness in generation. Lower values make output more deterministic. |
| Top P | 0.9 | Nucleus sampling parameter for balanced diversity and quality. |
| Top K | 40 | Limits consideration to top K most likely tokens. |
| Max Tokens | 2048 | Maximum number of tokens to generate per request. |
| Tensor Parallel Size | Auto-detected | Number of GPUs to use for model parallelism. |

## vLLM Configuration Parameters

| Parameter | Description | Auto-Configuration |
|-----------|-------------|-------------------|
| **Tensor Parallel Size** | Number of GPUs for model sharding | ✅ Based on detected GPUs and model size |
| **GPU Memory Utilization** | Fraction of GPU memory to use | ✅ Dynamically set to 0.9 for optimal performance |
| **Max Model Length** | Maximum sequence length | ✅ Auto-detected from model config |
| **Quantization Method** | Model precision optimization | ✅ Selected during download (FP16, INT8, AWQ, etc.) |
| **Block Size** | Memory block size for PagedAttention | ✅ Automatically optimized for hardware |

## 🚀 Hardware-Aware Model Recommendations

vLLM automatically configures optimal settings based on your hardware. The system provides intelligent precision recommendations during model download.

---

## Apple Silicon (M1/M2/M3) - 8-24GB Unified Memory

| Model Size | Recommended Precision | Est. Memory Usage | Performance Notes |
|------------|---------------------|-------------------|-------------------|
| **1B-3B models** | FP16 | 2-6GB | Excellent performance, full precision |
| **7B-8B models** | INT8 | 7-8GB | Good performance, quality preserved |
| **13B+ models** | AWQ/INT4 | 8-15GB | Compatibility-focused, reduced quality |

**Apple Silicon Notes:**
- Metal Performance Shaders acceleration automatically enabled
- Unified memory architecture allows larger context windows
- No discrete GPU memory limits - uses system RAM efficiently
- Best for development and single-user deployments

---

## NVIDIA RTX 4090 (24GB VRAM)

| Model Size | Recommended Precision | Tensor Parallel | Est. Throughput |
|------------|---------------------|----------------|----------------|
| **7B-8B models** | FP16 | 1 GPU | ~160 tok/sec |
| **13B-14B models** | INT8 | 1 GPU | ~95 tok/sec |
| **34B+ models** | AWQ/INT4 | 1 GPU | ~45 tok/sec |
| **70B+ models** | Not recommended | - | Insufficient VRAM |

**RTX 4090 Notes:**
- Excellent price/performance for single-GPU deployments
- Limited to smaller models due to 24GB VRAM constraint
- Ideal for development, testing, and small-scale production

---

## NVIDIA L4 (24GB VRAM) - Cloud Optimized

| Model Size | Recommended Precision | Tensor Parallel | Est. Throughput |
|------------|---------------------|----------------|----------------|
| **7B-8B models** | FP16 | 1 GPU | ~140 tok/sec |
| **13B-14B models** | INT8 | 1 GPU | ~85 tok/sec |
| **34B+ models** | AWQ/INT4 | 1 GPU | ~40 tok/sec |

**L4 Enterprise Notes:**
- Optimized for cloud inference workloads
- Excellent performance per watt efficiency
- Ideal for containerized deployments
- Multi-L4 scaling: 4x L4 can serve ~50 concurrent users

---

## NVIDIA A100 (40GB/80GB VRAM) - Enterprise Grade

### A100-40GB Configuration:

| Model Size | Recommended Precision | Tensor Parallel | Est. Throughput |
|------------|---------------------|----------------|----------------|
| **7B-8B models** | FP16 | 1 GPU | ~280 tok/sec |
| **13B-14B models** | FP16 | 1 GPU | ~190 tok/sec |
| **34B models** | INT8 | 1 GPU | ~120 tok/sec |
| **70B models** | AWQ/INT4 | 1 GPU | ~65 tok/sec |

### A100-80GB Configuration:

| Model Size | Recommended Precision | Tensor Parallel | Est. Throughput |
|------------|---------------------|----------------|----------------|
| **7B-8B models** | FP16 | 1 GPU | ~270 tok/sec |
| **13B-14B models** | FP16 | 1 GPU | ~185 tok/sec |
| **34B models** | FP16 | 1 GPU | ~140 tok/sec |
| **70B models** | INT8 | 1 GPU | ~85 tok/sec |

**A100 Enterprise Notes:**
- Tensor Core acceleration for maximum throughput
- Multi-A100 scaling supported for 70B+ models
- ECC memory for reliability in production environments
- Optimal for high-throughput enterprise deployments

---

## NVIDIA H100 (80GB VRAM) - Next-Generation Performance

| Model Size | Recommended Precision | Tensor Parallel | Est. Throughput |
|------------|---------------------|----------------|----------------|
| **7B-8B models** | FP16 | 1 GPU | ~450 tok/sec |
| **13B-14B models** | FP16 | 1 GPU | ~320 tok/sec |
| **34B models** | FP16 | 1 GPU | ~220 tok/sec |
| **70B models** | FP16 | 1 GPU | ~135 tok/sec |
| **70B models** | FP16 | 2 GPUs | ~250 tok/sec |

**H100 Enterprise Notes:**
- TransformerEngine acceleration provides 2x speedup vs A100
- NVLink connectivity for efficient multi-GPU scaling
- Optimal for mission-critical applications requiring guaranteed SLAs
- 8x H100 cluster can support 1000+ concurrent users

---

## Multi-GPU Scaling with vLLM

vLLM automatically handles multi-GPU deployments when multiple GPUs are detected:

### Tensor Parallelism
- **Single Model Across GPUs**: Large models (70B+) automatically split across available GPUs
- **Automatic Load Balancing**: vLLM handles weight distribution and communication
- **Linear Scaling**: 2 GPUs ≈ 2x throughput for memory-bound workloads

### Example Multi-GPU Configurations:
```
2x RTX 4090 (48GB total):     70B models in AWQ/INT4
2x A100-40GB (80GB total):    70B models in INT8/FP16  
4x A100-80GB (320GB total):   405B models possible
8x H100-80GB (640GB total):   Enterprise-scale deployments
```

## Model Precision Comparison

| Precision | Quality | Speed | VRAM Usage | Best For |
|-----------|---------|-------|------------|----------|
| **FP16** | Highest | Moderate | Highest | Quality-critical applications |
| **INT8** | High | Fast | Medium | Balanced performance/quality |
| **AWQ/INT4** | Good | Fastest | Lowest | Resource-constrained environments |

## 🛠️ Hardware Detection & Auto-Configuration

The system automatically:

1. **Detects available GPUs** and their VRAM capacity
2. **Recommends optimal precision** based on model size vs available memory
3. **Configures tensor parallelism** for multi-GPU setups
4. **Sets memory limits** to prevent OOM errors
5. **Optimizes batch sizing** for maximum throughput

## Performance Monitoring

Key metrics for vLLM deployments:

- **Throughput**: Tokens per second generated
- **Latency**: Time to first token (TTFT) and inter-token latency
- **GPU Utilization**: Target 85-95% for optimal efficiency
- **Memory Usage**: Monitor VRAM and system RAM consumption
- **Queue Depth**: Number of requests waiting for processing

## Important Notes

- **No manual configuration required**: vLLM automatically optimizes for your hardware
- **Legacy formats are no longer supported**: All models must be in a PyTorch/Transformers-compatible format.
- **Hardware detection is automatic**: The system prevents incompatible configurations
- **Precision is selected at download time**: Choose based on your hardware capabilities

---

## Hugging Face Cache Management

To prevent repeated downloads of the same models, vLLM now uses a central cache directory located at `models/hf_cache`. This directory stores the model files downloaded from Hugging Face.

**Key Points:**

- **Persistence:** The cache is persistent across container restarts, saving time and bandwidth.
- **Manual Deletion:** If you need to free up disk space, you can safely delete the contents of the `models/hf_cache` directory via the **System Maintenance** page. The system will automatically re-download any required models on their next use.
- **Location:** The cache is located on the larger, mounted `models/` drive to avoid filling up the main system disk.

---

**Quick Start**: Simply download a model through the HuggingFace interface, select the appropriate precision for your hardware, and vLLM handles the rest automatically!
