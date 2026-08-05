-- La base de tests la borra y recrea el runner de vitest en cada corrida;
-- acá sólo nos aseguramos de que el usuario `tienda` pueda hacerlo.
CREATE DATABASE IF NOT EXISTS `tienda_py_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
GRANT ALL PRIVILEGES ON `tienda_py_test`.* TO 'tienda'@'%';
GRANT CREATE, DROP ON *.* TO 'tienda'@'%';
FLUSH PRIVILEGES;
