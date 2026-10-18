import type { AuthoringCatalog } from '@/services/authoring';

/** The authoring lists and a parsed goal tree, as the helper answers them (shared by tests). */
export const CATALOG: AuthoringCatalog = {
  temporal_ops: ['ACHIEVE', 'MAINTAIN'],
  operators: ['<=', '>=', '==', '!=', '<', '>'],
  roles: {
    perception: {
      task: 'Detect Pedestrian',
      modules: ['yolov5m', 'yolov5s'],
      default: 'yolov5s',
      source: 'model/',
    },
    braking: {
      task: 'Apply Brakes',
      modules: ['emergency_braking', 'proportional_braking'],
      default: 'emergency_braking',
      source: 'util.py',
    },
  },
  assumption_quantities: [
    { name: 'fog_density', level: 'scenario', unit: '%', source: 'grid', available: true },
    { name: 'lane_width_m', level: 'run', unit: 'm', source: 'x', available: false },
  ],
  soft_goal_quantities: [{ name: 'resume_within_s', meaning: 'seconds' }],
  scenario_vocab: { fog_density: { fog: '50' } },
  examples: { source: 'docs/examples/R_baseline.dsl', goal: 'Pedestrian Safety' },
  suggestions: {
    goal: ['Pedestrian Safety'],
    scenario: ['A pedestrian trying to cross the street in fog.'],
    free_assumption: ['daylight, dry road'],
    free_soft_goal: ['braking is smooth unless an emergency stop is needed'],
    perception: {
      sub_goal: ['Pedestrian Check'],
      agent: ['Perception Module'],
      input: ['image'],
      output: ['pedestrian detection flag'],
      condition: [],
      task: [],
    },
    braking: {
      sub_goal: ['braking'],
      agent: ['braking module'],
      input: [],
      output: ['Braking Status Flag'],
      condition: [],
      task: ['Bring down throttle'],
    },
  },
  not_covered: ['"parallely" between sub-goals'],
};

export const TREE = {
  temporal: 'MAINTAIN',
  objective: 'Pedestrian Safety',
  refinement: {
    combinator: 'followed by',
    goals: [
      {
        objective: 'Pedestrian Check',
        agent: 'Perception Module',
        operations: [
          {
            task: 'Detect Pedestrian',
            tasks: ['Detect Pedestrian'],
            condition: null,
            module: 'yolov5s',
            inputs: ['image'],
            outputs: ['flag'],
          },
        ],
      },
      {
        objective: 'braking',
        agent: 'braking module',
        operations: [
          {
            task: 'Apply Brakes',
            tasks: ['Apply Brakes'],
            condition: null,
            module: 'emergency_braking',
            inputs: ['flag'],
            outputs: ['status'],
          },
        ],
      },
    ],
  },
  scenario: 'A pedestrian trying to cross the street in fog.',
  assumptions: [],
  soft_goals: [],
};
