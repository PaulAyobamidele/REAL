from grape import grape
from grape import algorithms
import re
from ast import literal_eval

import warnings
warnings.filterwarnings('ignore')

from os import path
import pandas as pd
import numpy as np
from deap import creator, base, tools
import random

from scripts.simulations.util import falsifier, evaluate
from scripts.analysis import telemetry
from scripts.evolve.constraints import constrain_population
from scripts.evolve.run_output import persist_run, run_dir
import multiprocessing

import os
import mlflow
import redis

from real_config import settings


def start_ge(sample=False, grammar_file='old/old.bnf', constraints=None,
             run_id=None, requirement=None, scenario_text=None,
             population_size=None, max_generations=None, record_video=True,
             braking_mode=None, yolo_model=None):

    # Connect to Redis
    # env = redis.StrictRedis(host='localhost', port=6379, decode_responses=True)

    # mlflow.set_tracking_uri(uri=env.get('mlflow_tracking_uri'))
    # os.environ["MLFLOW_TRACKING_URI"] = env.get('mlflow_tracking_uri')

    if braking_mode is not None or yolo_model is not None:
        # The system under test, as named in the requirement ("performed by").
        from scripts.simulations.util import configure
        configure(braking_mode=braking_mode, yolo_model=yolo_model)

    GRAMMAR_FILE = grammar_file
    BNF_GRAMMAR = grape.Grammar(os.path.join(settings.grammar_base_dir, GRAMMAR_FILE))

    if run_id:
        # Every simulation in this run logs its details to
        # <run_dir>/simulations.csv (see scripts/analysis/telemetry.py).
        telemetry.set_run(run_id, run_dir(run_id))

    toolbox = base.Toolbox()

    # define a single objective, minimising fitness strategy:
    creator.create("FitnessMin", base.Fitness, weights=(-1.0,))

    creator.create('Individual', grape.Individual, fitness=creator.FitnessMin)

    toolbox.register("populationCreator", grape.sensible_initialisation, creator.Individual) 
    # toolbox.register("populationCreator", grape.random_initialisation, creator.Individual) 
    #toolbox.register("populationCreator", grape.PI_Grow, creator.Individual) 

    toolbox.register("evaluate", evaluate)

    # Tournament selection:
    toolbox.register("select", tools.selTournament, tournsize=7) #selLexicaseFilter

    # Single-point crossover:
    toolbox.register("mate", grape.crossover_onepoint)

    # Flip-int mutation:
    toolbox.register("mutate", grape.mutation_int_flip_per_codon)

    # pool = multiprocessing.Pool(32)
    # toolbox.register("map", pool.map)

    POPULATION_SIZE = population_size or 1000
    MAX_INIT_TREE_DEPTH = 6
    MIN_INIT_TREE_DEPTH = 4

    MAX_GENERATIONS = max_generations or 200
    P_CROSSOVER = 0.8
    P_MUTATION = 0.01
    ELITE_SIZE = 0#round(0.01*POPULATION_SIZE) #it should be smaller or equal to HALLOFFAME_SIZE
    HALLOFFAME_SIZE = 1#round(0.01*POPULATION_SIZE) #it should be at least 1

    MIN_INIT_GENOME_LENGTH = 95#*6
    MAX_INIT_GENOME_LENGTH = 115#*6
    random_initilisation = False #put True if you use random initialisation

    CODON_CONSUMPTION = 'lazy'
    GENOME_REPRESENTATION = 'list'
    MAX_GENOME_LENGTH = None#'auto'

    MAX_TREE_DEPTH = 35 #equivalent to 17 in GP with this grammar
    MAX_WRAPS = 0
    CODON_SIZE = 255

    # Seeds DEAP/grape's use of `random` (population init, selection,
    # crossover, mutation). Per-scenario Scenic sampling is seeded separately
    # in scripts/simulations/util.py::evaluate_phenotype.
    random.seed(settings.random_seed)

    population = toolbox.populationCreator(pop_size=POPULATION_SIZE, 
                                        bnf_grammar=BNF_GRAMMAR, 
                                        min_init_depth=MIN_INIT_TREE_DEPTH,
                                        max_init_depth=MAX_INIT_TREE_DEPTH,
                                        codon_size=CODON_SIZE,
                                        codon_consumption=CODON_CONSUMPTION,
                                        genome_representation=GENOME_REPRESENTATION
                                            )
    if sample==True:
        return [ind.phenotype for ind in population]
    else:

        if constraints:
            # Oversample and bias the initial population toward phenotypes
            # matching the requirement-derived constraints, rather than
            # changing grape/DEAP's grammar or search machinery itself.
            oversampled = toolbox.populationCreator(pop_size=3 * POPULATION_SIZE,
                                                bnf_grammar=BNF_GRAMMAR,
                                                min_init_depth=MIN_INIT_TREE_DEPTH,
                                                max_init_depth=MAX_INIT_TREE_DEPTH,
                                                codon_size=CODON_SIZE,
                                                codon_consumption=CODON_CONSUMPTION,
                                                genome_representation=GENOME_REPRESENTATION
                                                    )
            population = constrain_population(oversampled, constraints, POPULATION_SIZE)

        # for ind in population:
        #     print(ind.phenotype,'\n')

        # # define the hall-of-fame object:
        hof = tools.HallOfFame(HALLOFFAME_SIZE)

        # prepare the statistics object:
        stats = tools.Statistics(key=lambda ind: ind.fitness.values)
        stats.register("avg", np.nanmean)
        stats.register("std", np.nanstd)
        stats.register("min", np.nanmin)
        stats.register("max", np.nanmax)

        # 'behavioural_diversity' and 'fitness_diversity' require per-sample
        # fitness tracking (ind.fitness_each_sample) and a train/test split
        # (points_train/points_test) respectively - neither applies here
        # (fitness is a single CARLA-falsification score per individual, no
        # train/test split), and including them crashes ge_eaSimpleWithElitism
        # on generation 0 (grape/algorithms.py:131). This was unreachable
        # before this fix since sample=False was never actually invoked.
        REPORT_ITEMS = ['gen', 'invalid', 'avg', 'std', 'min', 'max',
                        'best_ind_length', 'avg_length',
                        'best_ind_nodes', 'avg_nodes',
                        'best_ind_depth', 'avg_depth',
                        'avg_used_codons', 'best_ind_used_codons',
                        'structural_diversity',
                        'selection_time', 'generation_time']

        # perform the Grammatical Evolution flow:
        population, logbook = algorithms.ge_eaSimpleWithElitism(population, 
                                                                toolbox, 
                                                                cxpb=P_CROSSOVER, 
                                                                mutpb=P_MUTATION,
                                                                ngen=MAX_GENERATIONS, 
                                                                elite_size=ELITE_SIZE,
                                                                bnf_grammar=BNF_GRAMMAR,
                                                                codon_size=CODON_SIZE,
                                                                max_tree_depth=MAX_TREE_DEPTH,
                                                                max_genome_length=MAX_GENOME_LENGTH,
                                                                codon_consumption=CODON_CONSUMPTION,
                                                                report_items=REPORT_ITEMS,
                                                                genome_representation=GENOME_REPRESENTATION,
                                                                stats=stats, 
                                                                halloffame=hof,
                                                                verbose=False)

        if run_id:
            persist_run(run_id, logbook, hof, requirement=requirement,
                        scenario_text=scenario_text, constraints=constraints,
                        record_video=record_video)

        return {
            "run_id": run_id,
            "best_phenotype": hof[0].phenotype if len(hof) else None,
            "logbook": logbook,
        }

