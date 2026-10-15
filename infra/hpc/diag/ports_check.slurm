#!/bin/bash
# Diagnostic: do two CARLA servers on one node really listen on their own
# ports? (Study, 2026-10-15: two jobs on one node ended up sharing one CARLA.)
# Starts three servers in one job, so they share a node by construction; after
# each start, lists the ports listening on the node (from the host, so the
# image needs no `ss`), then asks each candidate port for the server version.
#   A: -carla-port=20500        (the flag the study job script uses)
#   B: -carla-port=20600        (a second server, same flag)
#   C: -carla-rpc-port=20700    (the flag in CARLA's current documentation)
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --time=00:20:00
#SBATCH --job-name=real-ports-check
#SBATCH --output=%x-%j.out

module load apptainer
IMAGE="$SCRATCH/real_project/carla.sif"
RUN=(apptainer exec --nv "$IMAGE")

ports() {
    echo "=== $1"
    ss -ltn 2>/dev/null | awk 'NR>1 {print $4}' \
        | grep -E ':(200[0-9]|205[0-9][0-9]|206[0-9][0-9]|207[0-9][0-9])$' | sort || echo "(none)"
}

"${RUN[@]}" /home/carla/CarlaUE4.sh -RenderOffScreen -nosound -carla-port=20500 > carla_A_$SLURM_JOB_ID.log 2>&1 &
sleep 45; ports "after server A (-carla-port=20500)"

"${RUN[@]}" /home/carla/CarlaUE4.sh -RenderOffScreen -nosound -carla-port=20600 > carla_B_$SLURM_JOB_ID.log 2>&1 &
sleep 45; ports "after server B (-carla-port=20600)"
echo "--- server B log, last lines:"; tail -4 carla_B_$SLURM_JOB_ID.log

"${RUN[@]}" /home/carla/CarlaUE4.sh -RenderOffScreen -nosound -carla-rpc-port=20700 > carla_C_$SLURM_JOB_ID.log 2>&1 &
sleep 45; ports "after server C (-carla-rpc-port=20700)"
echo "--- server C log, last lines:"; tail -4 carla_C_$SLURM_JOB_ID.log

echo "=== client: which ports answer"
for p in 2000 20500 20600 20700; do
    "${RUN[@]}" python3.8 -c "import carla, sys
c = carla.Client('127.0.0.1', int(sys.argv[1])); c.set_timeout(5.0)
print(sys.argv[1], 'answers: server', c.get_server_version())" "$p" 2>&1 | tail -1
done

kill $(jobs -p) 2>/dev/null || true   # only the servers this job started
