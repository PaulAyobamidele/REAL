from lark import Lark, Token, Tree

class DSL:

    def __init__(self,req):

        # Define the grammar
        self.grammar = r"""
        start          : (goal)+
        goal           : temporal_op objective "by" refined_goal "in scenario where" scenario ("assuming" assumption ("&" assumption)*)? ("ensuring" soft_goal ("&" soft_goal)*)?
        refined_goal   : objective "using" agent ("operationalized as" operation)?
                       | (refined_goal "followed by" refined_goal)* 
                       | (refined_goal "parallely" refined_goal)*

        operation      : task ("if" condition)? "performed by" module "taking input" input ("&" input)* "producing output" output ("&" output)*   
                       | (operation "triggering" operation)* 
                    #    | (operation "achieving" objective)* 

        !temporal_op   : "ACHIEVE"
                       | "MAINTAIN"

        objective      : STRING
                       | objective ("&" objective)*

        condition      : STRING 
                       | condition ("&" condition)*
                       | condition ("|" condition)*

        agent          : STRING
        task           : STRING 
                       | task ("&" task)*
        module         : STRING
        scenario       : STRING
        input          : STRING
        output         : STRING
        assumption     : STRING
        soft_goal      : STRING

        %import common.ESCAPED_STRING   -> STRING
        %import common.WS
        %ignore WS
        COMMENT        : /#[^\n]*/
        %ignore COMMENT
        """

        # Instantiate the parser. `!temporal_op` keeps the ACHIEVE / MAINTAIN
        # keyword token (Lark drops anonymous tokens otherwise) and
        # propagate_positions records where each subtree sits in the source,
        # which get_goal_tree() needs to tell "followed by" from "parallely":
        # both keywords are dropped from the tree.
        self.parser = Lark(self.grammar, start="goal", propagate_positions=True)
        self.requirement = req
        # Why a requirement did not parse (Lark's message: line, column, what
        # was found, what was expected). None when it parsed. Callers that
        # only check `parse_tree is None` keep working; api_app.py surfaces
        # this so a mistyped keyword is no longer a silent failure (it cost a
        # Narval job once - infra/hpc/README.md, obstacle 3).
        self.parse_error = None
        self.parse_tree = self.verify_grammar()

    def verify_grammar(self):
        if self.requirement is None:
            self.parse_error = "no requirement text given"
            return None
        try:
            return self.parser.parse(self.requirement)
        except Exception as e:  # lark.exceptions.UnexpectedInput and friends
            self.parse_error = str(e).strip()
            return None
        
    @staticmethod
    def _strings(tree):
        """All quoted STRING tokens under `tree`, unquoted, in order.
        Flattens nested `task ("&" task)*` / `condition` / `objective` trees."""
        return [str(tok)[1:-1] for tok in tree.scan_values(lambda v: isinstance(v, Token))]

    def get_operations(self):
        """Every `operation` in the requirement as a dict:
            {'task': 'A & B', 'tasks': ['A', 'B'], 'condition': '...' or None,
             'module': '...', 'inputs': [...], 'outputs': [...]}
        Empty list if the requirement did not parse."""
        if self.parse_tree is None:
            return []
        return self._operations_under(self.parse_tree)

    def _operations_under(self, tree):
        """The operations below `tree`, in source order (composite
        `operation "triggering" operation` nodes carry no task themselves
        and are skipped; their parts are listed)."""
        operations = []
        for st in tree.iter_subtrees():
            if isinstance(st, Tree) and st.data == 'operation':
                op = self._operation(st)
                if op is not None:
                    operations.append(op)
        return operations

    def _operation(self, st):
        op = {'task': None, 'tasks': [], 'condition': None, 'module': None, 'inputs': [], 'outputs': []}
        for child in st.children:
            if not isinstance(child, Tree):
                continue
            strings = self._strings(child)
            if child.data == 'task' and strings:
                op['task'] = ' & '.join(strings)
                op['tasks'] = strings
            elif child.data == 'condition' and strings:
                op['condition'] = ' & '.join(strings)
            elif child.data == 'module' and strings:
                op['module'] = strings[0]
            elif child.data == 'input':
                op['inputs'] += strings
            elif child.data == 'output':
                op['outputs'] += strings
        return op if (op['module'] or op['task']) else None

    def get_goal_tree(self):
        """The requirement as a goal tree (KAOS): the top goal, its
        refinement (the refined goals with their agent and operations, and
        how they are combined), the scenario, the assumptions and the soft
        goals. JSON-serialisable; None if the requirement did not parse.

            {'temporal': 'MAINTAIN', 'objective': 'Pedestrian Safety',
             'refinement': {'combinator': 'followed by', 'goals': [
                 {'objective': 'Pedestrian Check', 'agent': 'Perception Module',
                  'operations': [{'task': ..., 'tasks': [...], 'condition': ..., 'module': ...,
                                  'inputs': [...], 'outputs': [...]}]}, ...]},
             'scenario': '...', 'assumptions': [...], 'soft_goals': [...]}

        Exported into analysis_report.json (requirement.tree) so that the
        review interface renders the goal model from the one parser this
        project has, instead of re-implementing the grammar."""
        if self.parse_tree is None:
            return None
        tree = {'temporal': None, 'objective': None, 'refinement': None,
                'scenario': self.get_scenario(),
                'assumptions': self.get_assumptions(),
                'soft_goals': self.get_soft_goals()}
        for child in self.parse_tree.children:
            if not isinstance(child, Tree):
                continue
            if child.data == 'temporal_op':
                tokens = [str(t) for t in child.children if isinstance(t, Token)]
                tree['temporal'] = tokens[0] if tokens else None
            elif child.data == 'objective':
                tree['objective'] = ' & '.join(self._strings(child))
            elif child.data == 'refined_goal':
                tree['refinement'] = self._refinement(child)
        return tree

    def _refinement(self, node):
        """A `refined_goal` subtree: either one goal (objective, agent,
        operations) or a combination of goals. A chain of the same
        combinator (A followed by B followed by C) is flattened into one list."""
        kids = [c for c in node.children if isinstance(c, Tree)]
        if kids and all(k.data == 'refined_goal' for k in kids):
            combinator = self._combinator(kids)
            goals = []
            for kid in kids:
                sub = self._refinement(kid)
                if 'goals' in sub and sub['combinator'] == combinator:
                    goals.extend(sub['goals'])
                else:
                    goals.append(sub)
            return {'combinator': combinator, 'goals': goals}
        goal = {'objective': None, 'agent': None, 'operations': []}
        for kid in kids:
            if kid.data == 'objective':
                goal['objective'] = ' & '.join(self._strings(kid))
            elif kid.data == 'agent':
                goal['agent'] = (self._strings(kid) or [None])[0]
            elif kid.data == 'operation':
                goal['operations'].extend(self._operations_under(kid))
        return goal

    def _combinator(self, kids):
        """'followed by' / 'parallely' between consecutive refined goals, read
        from the source text between them (the keyword itself is not in the
        tree); 'unknown' if the text is not available or mixed."""
        words = set()
        for a, b in zip(kids, kids[1:]):
            try:
                between = self.requirement[a.meta.end_pos:b.meta.start_pos]
            except (AttributeError, TypeError):
                between = ''
            if 'parallely' in between:
                words.add('parallely')
            elif 'followed by' in between:
                words.add('followed by')
        return words.pop() if len(words) == 1 else 'unknown'

    def get_module_for(self, task):
        """Module the requirement says performs `task` (e.g. "Detect Pedestrian"
        -> "yolov5s"), or None. Matches a task listed alone or with '&'."""
        for op in self.get_operations():
            if op['task'] and task in [t.strip() for t in op['task'].split('&')]:
                return op['module']
        return None

    def get_assumptions(self):
        """Domain assumptions from the optional clause
            ... in scenario where "..." assuming "fog_density <= 50" & "daylight"
        (KAOS domain properties / ODD limits - REAL paper Sec. IV-A, Phi_valid).
        Returns [] when the clause is absent or the requirement did not parse.
        The clause is optional, so requirements without it parse exactly as
        before. Machine-readable ones ("<param> <op> <value>") are turned into
        admissibility rules by scripts/analysis/admissibility.py; anything else
        is free text for the human."""
        if self.parse_tree is None:
            return []
        # `assumption` trees are direct children of `goal`, in source order.
        return [self._strings(c)[0] for c in self.parse_tree.children
                if isinstance(c, Tree) and c.data == 'assumption' and self._strings(c)]

    def get_soft_goals(self):
        """Soft goals from the optional clause
            ... assuming "..." ensuring "vehicle resumes within 10 s once the crossing is clear"
        (KAOS soft goals - quality attributes to optimise, e.g. the paper's
        SmoothBraking / progress). [] when absent or unparsed. Optional, so
        requirements without it parse exactly as before. Added 2026-09-23 when
        round 2 showed a mitigation satisfying the safety goal by never moving
        again: the requirement had no place to say the car must keep going."""
        if self.parse_tree is None:
            return []
        return [self._strings(c)[0] for c in self.parse_tree.children
                if isinstance(c, Tree) and c.data == 'soft_goal' and self._strings(c)]

    def get_perception_model(self):
        # Previously walked refined_goal -> operation -> operation, one level
        # deeper than the parser produces, so it always returned None (even for
        # the reference requirement in infra/hpc/run_real_av.slurm).
        return self.get_module_for("Detect Pedestrian")

    def get_scenario(self):

        if self.parse_tree is None:
            return None
        for _st in self.parse_tree.iter_subtrees():
            if isinstance(_st, Tree) and _st.data=='scenario':
                for _stt in _st.children:
                    return _stt[1:-1]
                

