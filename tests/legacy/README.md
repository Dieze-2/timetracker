Version d'origine de l'app (commit `5142890`), figée comme référence des calculs
(les tests vérifient que les formules donnent les mêmes résultats).

Les fichiers sont en `.txt` exprès : si le dépôt est publié comme site statique,
ils ne doivent pas être exécutables. Cette ancienne version partage le stockage
de l'app (clé `horaireData`) et la réécrirait dans l'ancien format. Seul
`tests/run.mjs` les sert, en retirant l'extension `.txt`.
