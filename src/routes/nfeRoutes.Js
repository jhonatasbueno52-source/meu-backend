import express from 'express';
import {
  emitirNFe,
  consultarStatusNFe,
  cancelarNFe,
  downloadXML,
  downloadDANFE,
  enviarEmailNFe,
  validarCertificado
} from '../controllers/nfeController.js';

const router = express.Router();

router.post('/emit', emitirNFe);
router.get('/status', consultarStatusNFe);
router.post('/cancel', cancelarNFe);
router.get('/download-xml', downloadXML);
router.get('/download-danfe', downloadDANFE);
router.post('/send-email', enviarEmailNFe);
router.get('/validate-certificate', validarCertificado);

export default router;