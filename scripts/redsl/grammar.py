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

        temporal_op    : "ACHIEVE" 
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
        """

        # Instantiate the parser
        self.parser = Lark(self.grammar, start="goal")
        self.requirement = req
        self.parse_tree = self.verify_grammar()

    def verify_grammar(self):
        try:
            self.requirement = self.requirement
            sparse_tree = self.parser.parse(self.requirement)
            return sparse_tree
        except:
            return None
        
    @staticmethod
    def _strings(tree):
        """All quoted STRING tokens under `tree`, unquoted, in order.
        Flattens nested `task ("&" task)*` / `condition` / `objective` trees."""
        return [str(tok)[1:-1] for tok in tree.scan_values(lambda v: isinstance(v, Token))]

    def get_operations(self):
        """Every `operation` in the requirement as a dict:
            {'task': 'A & B', 'condition': '...' or None, 'module': '...',
             'inputs': [...], 'outputs': [...]}
        Empty list if the requirement did not parse."""
        if self.parse_tree is None:
            return []
        operations = []
        for st in self.parse_tree.iter_subtrees():
            if not (isinstance(st, Tree) and st.data == 'operation'):
                continue
            op = {'task': None, 'condition': None, 'module': None, 'inputs': [], 'outputs': []}
            for child in st.children:
                if not isinstance(child, Tree):
                    continue
                strings = self._strings(child)
                if child.data in ('task', 'condition') and strings:
                    op[child.data] = ' & '.join(strings)
                elif child.data == 'module' and strings:
                    op['module'] = strings[0]
                elif child.data == 'input':
                    op['inputs'] += strings
                elif child.data == 'output':
                    op['outputs'] += strings
            if op['module'] or op['task']:
                operations.append(op)
        return operations

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

        # print("I'm in scenario")

        for _st in self.parse_tree.iter_subtrees():
            if isinstance(_st, Tree) and _st.data=='scenario':
                for _stt in _st.children:
                    return _stt[1:-1]
                

