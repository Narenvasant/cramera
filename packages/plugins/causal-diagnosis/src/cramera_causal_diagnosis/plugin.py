"""
The causal diagnosis plugin: tabs showing a robot experiment's causal analysis next to
its run, read from the documents the experiment writes into cramera's data directory.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from importlib.metadata import version
from pathlib import Path

from typing_extensions import List, Optional

from cramera.http.messages import HttpMethod, Request, Response
from cramera.plugins import (
    PluginContext,
    PluginPrefixRoute,
    PluginRoute,
    RouteDeclaration,
    ViewerPlugin,
)
from cramera_causal_diagnosis.exceptions import (
    ExperimentFileNotFound,
    ExperimentPathOutside,
)

WEB_DIRECTORY = Path(__file__).parent / "web"
"""
The plugin's browser files.
"""


class CausalDiagnosisRoute(StrEnum):
    """
    The plugin's routes, below ``/api/plugins/causal-diagnosis/``.
    """

    EXPERIMENTS = "experiments"
    """
    The experiments that wrote documents.
    """

    FILES = "files/"
    """
    One document of one experiment, addressed as ``<experiment>/<path>``.
    """


@dataclass
class ExperimentsDirectory:
    """
    The directory every experiment writes its documents into, one subdirectory each.
    """

    path: Path
    """
    The directory.
    """

    def experiments(self) -> List[str]:
        """
        :return: The experiments that wrote documents, by name.
        """
        if not self.path.is_dir():
            return []
        return sorted(child.name for child in self.path.iterdir() if child.is_dir())

    def file(self, requested: str) -> Path:
        """
        :param requested: ``<experiment>/<path>`` of a document.
        :return: The document's file.
        :raises ExperimentPathOutside: If the path leads out of the directory.
        :raises ExperimentFileNotFound: If no such document was written.
        """
        root = self.path.resolve()
        candidate = (root / requested).resolve()
        if root not in candidate.parents:
            raise ExperimentPathOutside(requested)
        if not candidate.is_file():
            raise ExperimentFileNotFound(requested)
        return candidate


@dataclass
class CausalDiagnosisPlugin(ViewerPlugin):
    """
    Shows an experiment's causal analysis in tabs of the scene page: the experiment and
    its causal answers, the joint probability tree, the causal graph, why the latest
    run failed, and every run's NEEM.
    """

    directory: Optional[ExperimentsDirectory] = field(default=None, init=False)
    """
    Where the experiments' documents are read from, once the viewer asked for the
    routes.
    """

    def name(self) -> str:
        return "causal-diagnosis"

    def version(self) -> str:
        return version("cramera-causal-diagnosis")

    def web_directory(self) -> Optional[Path]:
        return WEB_DIRECTORY

    def module(self) -> Optional[str]:
        return "index.js"

    def routes(self, context: PluginContext) -> List[RouteDeclaration]:
        """
        :param context: What the viewer offers the plugin.
        :return: The list of experiments and their documents.
        """
        self.directory = ExperimentsDirectory(context.locations.data / "experiments")
        return [
            PluginRoute(
                HttpMethod.GET,
                CausalDiagnosisRoute.EXPERIMENTS,
                self.answer_experiments,
            ),
            PluginPrefixRoute(
                HttpMethod.GET, CausalDiagnosisRoute.FILES, self.answer_file
            ),
        ]

    def answer_experiments(self, request: Request) -> Response:
        """
        :param request: A request for the experiments.
        :return: Their names.
        """
        return Response.of_json({"experiments": self.directory.experiments()})

    def answer_file(self, request: Request, requested: str) -> Response:
        """
        :param request: A request for one document.
        :param requested: ``<experiment>/<path>`` of the document.
        :return: The document.
        """
        return Response.of_file(self.directory.file(requested))
