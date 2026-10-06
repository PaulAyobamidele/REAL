# REAL demo image: the whole REAL loop on two real rounds (run on CARLA on the
# Narval cluster), on any machine with Docker - no simulator, GPU or network.
#
#   docker build -t real-demo .
#   docker run --rm -p 8501:8501 real-demo                 # then open http://localhost:8501
#   docker run --rm -p 8501:8501 -v "$PWD/demo_output:/work/demo_output" real-demo   # keep the files
#
# It runs `python -m scripts.demo --page`: analysis of both rounds, the round
# comparison, the baseline-assumption re-check, a scripted review and the
# proposed next requirement, then serves the review page on that result.
# The full pipeline (CARLA + YOLO + GE on a GPU) is the Apptainer image in
# infra/hpc/ (see infra/hpc/README.md).
FROM python:3.8-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/opt/real
WORKDIR /opt/real
COPY requirements-demo.txt .
RUN pip install --no-cache-dir -r requirements-demo.txt
COPY . .

WORKDIR /work
EXPOSE 8501
ENTRYPOINT ["python", "-m", "scripts.demo", "--page", "--address", "0.0.0.0"]
